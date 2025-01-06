import chromadb
from glob import glob
import logging
from omegaconf import OmegaConf
import os
from os.path import basename, exists, join
import random
from threading import Thread
import uuid
from typing import List, Dict, Any

from tapestry.embeddings import Embedder

logger = logging.getLogger(__name__)

class DatabaseManager:
    def __init__(
        self,
        app_config: Dict[str, Any],
        db_path: str,
        db_name: str,
        db_meta: Dict[str, str],
        embedding_model_address: str,
        embedding_dimension: int,
        embedding_image_size: int = (1024, 1024),
        image_extensions: list = [".gif", ".jpg", ".jpeg", ".png", ".webp"],
        batch_size: int = 32,
    ):
        self.config = app_config

        self.db_path = db_path
        self.db_name = db_name
        self.db_meta = OmegaConf.to_container(db_meta, resolve=True)

        self.image_extensions = image_extensions
        self.batch_size = batch_size

        self.chroma_client = chromadb.PersistentClient(path=self.db_path)

        self.collection = self.chroma_client.get_or_create_collection(
            name=self.db_name,
            metadata=self.db_meta,
            embedding_function=Embedder(
                embedding_model_address,
                embedding_dimension,
                embedding_image_size,
            ),
        )

    def process_images_batch(self, image_paths: List[str]) -> None:
        for i in range(0, len(image_paths), batch_size):
            batch = image_paths[i:i + batch_size]
            new_files = []
            new_ids = []
            new_metadata = []

            for image_path in batch:
                if self.config['IMAGE_FOLDER'] not in image_path:
                    continue

                existing_entries = self.collection.get(
                    where={"filename": basename(image_path)}
                )

                if existing_entries and len(existing_entries['ids']) > 0:
                    continue

                file_id = str(uuid.uuid4())
                new_files.append(image_path)
                new_ids.append(file_id)
                new_metadata.append({
                    "type": "image",
                    "filename": basename(image_path),
                    "original_path": image_path,
                    "processed": True
                })

            if new_files:
                try:
                    self.collection.add(
                        documents=new_files,
                        metadatas=new_metadata,
                        ids=new_ids
                    )
                    self.config['PROCESSING_STATUS']['processed_count'] += len(new_files)
                except Exception as image_batch_exception:
                    logger.error(f"{image_batch_exception=}")

    def background_process_images(self, image_files: List[str]) -> None:
        self.config['PROCESSING_STATUS']['is_processing'] = True
        self.config['PROCESSING_STATUS']['total_count'] = len(image_files)
        self.config['PROCESSING_STATUS']['processed_count'] = 0

        self.process_images_batch(image_files, self.batch_size)
        self.config['PROCESSING_STATUS']['is_processing'] = False

    def initialize_database(self) -> None:
        self.config['PROCESSING_STATUS']['is_processing'] = True

        image_files = []
        for ext in self.image_extensions:
            image_files.extend(glob(join(self.config['IMAGE_FOLDER'], f'*{ext}')))
            image_files.extend(glob(join(self.config['IMAGE_FOLDER'], f'*{ext.upper()}')))

        random.shuffle(image_files)

        self.config['PROCESSING_STATUS']['total_count'] = len(image_files)
        self.config['PROCESSING_STATUS']['processed_count'] = 0

        for i in range(0, len(image_files), self.batch_size):
            batch = image_files[i:i + self.batch_size]
            try:
                self.collection.add(
                    documents=batch,
                    metadatas=[{
                        "type": "image",
                        "filename": basename(path),
                        "original_path": path
                    } for path in batch],
                    ids=[str(uuid.uuid4()) for _ in batch]
                )
                self.config['PROCESSING_STATUS']['processed_count'] += len(batch)
            except Exception as e:
                logger.error(f"Error processing batch: {e}")

        self.config['PROCESSING_STATUS']['is_processing'] = False
        logger.info(f"Database initialized with {self.config['PROCESSING_STATUS']['processed_count']} images")

    def initialize_from_dataset(self, dataset_dir: str) -> None:
        self.config['PROCESSING_STATUS']['is_processing'] = True

        try:
            samples = self.load_dataset_splits(dataset_dir)
            self.config['PROCESSING_STATUS']['total_count'] = len(samples)
            self.config['PROCESSING_STATUS']['processed_count'] = 0
            self.process_dataset_batch(dataset_dir, samples)

            num_images = self.config['PROCESSING_STATUS']['processed_count']

            logger.info(f"chromaDB initialized with {num_images=}")
        except Exception as e:
            logger.error(f"Error initializing from dataset: {e}")
        finally:
            self.config['PROCESSING_STATUS']['is_processing'] = False

    def start_initialization(self) -> None:
        thread = Thread(target=self.initialize_database)
        thread.daemon = True
        thread.start()

    def perform_search(
        self,
        query_type: str,
        query: str = None,
        query_path: str = None,
        limit: int = None,
    ) -> Dict:
        try:
            if query_type == 'text':
                if not query:
                    raise ValueError('No query input provided.')
                else:
                    logger.info(f"text search: {query=}")

                results = self.collection.query(
                    query_texts=[query],
                    n_results=limit,
                    include=['metadatas', 'distances', 'documents']
                )
            elif query_type == 'image':
                if not query_path:
                    raise ValueError('No query image provided.')
                else:
                    logger.info(f"image search: {query_path=}")

                results = self.collection.query(
                    query_texts=[query_path],
                    n_results=limit,
                    include=['metadatas', 'distances', 'documents']
                )
            else:
                raise ValueError('Invalid search type.')

            return self._format_search_results(results, query_type, query_path, limit)

        except Exception as e:
            logger.error(f"Search error: {str(e)}", exc_info=True)
            raise

    def _format_search_results(
        self,
        results: Dict,
        query_type: str,
        query_path: str = None,
        limit: int = 100
    ) -> Dict:

        unique_results = {}

        for idx, (doc, metadata, distance) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        )):
            if query_type == 'image' and doc == query_path:
                continue

            filename = basename(doc)
            if filename not in unique_results or distance < unique_results[filename]['distance']:
                url = f"/uploads/{filename}" if 'uploads' in doc else f"/images/{filename}"
                unique_results[filename] = {
                    'path': doc,
                    'filename': filename,
                    'url': url,
                    'distance': float(distance),
                    'metadata': metadata,
                    'rank': idx + 1
                }

        formatted_results = list(unique_results.values())
        formatted_results.sort(key=lambda x: x['distance'])
        formatted_results = formatted_results[:max(limit, len(formatted_results))]

        for idx, result in enumerate(formatted_results):
            result['rank'] = idx + 1

        return {
            'results': formatted_results,
            'total': len(formatted_results),
            'query_type': query_type
        }

    def remove_temp_files(self) -> None:
        upload_files = glob(join(self.config['UPLOAD_FOLDER'], '*'))
        db_files = set(self.collection.get()['documents'])

        for file_path in upload_files:
            if file_path not in db_files and exists(file_path):
                os.remove(file_path)
