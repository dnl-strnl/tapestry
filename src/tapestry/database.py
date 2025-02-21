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
logging.basicConfig(level=logging.DEBUG)

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
        image_extensions: list = ['.gif', '.jpg', '.jpeg', '.png', '.webp'],
        batch_size: int = 32,
    ):
        self.config = app_config
        self.db_path = db_path
        self.db_name = db_name
        self.db_meta = OmegaConf.to_container(db_meta, resolve=True)
        self.image_extensions = image_extensions
        self.batch_size = batch_size
        self.embedding_model_address = embedding_model_address
        self.embedding_dimension = embedding_dimension
        self.embedding_image_size = embedding_image_size
        self.initialization_complete = False

        logger.debug(f'manager: {db_path}, name: {db_name}, {self.config["IMAGE_FOLDER"]}')

        os.makedirs(self.config['IMAGE_FOLDER'], exist_ok=True)
        os.makedirs(self.config['UPLOAD_FOLDER'], exist_ok=True)
        os.makedirs(self.db_path, exist_ok=True)

        self.embedder = Embedder(
            self.embedding_model_address,
            self.embedding_dimension,
            self.embedding_image_size,
        )

        try:
            self.chroma_client = chromadb.PersistentClient(path=self.db_path)
            self.collection = self.chroma_client.get_or_create_collection(
                name=self.db_name,
                metadata=self.db_meta,
                embedding_function=self.embedder,
            )
            logger.debug(f'get {self.db_name}')

            if len(self.collection.get()['ids']) == 0:
                logger.debug('empty collection, starting initialization...')
                self.start_initialization()

        except Exception as db_manager_init_error:
            logger.error(f'{db_manager_init_error=}', exc_info=True)
            raise

    def start_initialization(self) -> None:
        thread = Thread(target=self.initialize_database)
        thread.daemon = False
        thread.start()
        return thread

    def initialize_database(self) -> None:
        logger.debug('Starting database initialization')
        self.config['PROCESSING_STATUS']['is_processing'] = True

        try:
            image_files = []
            for ext in self.image_extensions:
                pattern = join(self.config['IMAGE_FOLDER'], f'*{ext}')
                found_files = glob(pattern)
                logger.debug(f'Found {len(found_files)} files with pattern `{pattern}`.')
                image_files.extend(found_files)

                pattern_upper = join(self.config['IMAGE_FOLDER'], f'*{ext.upper()}')
                found_files_upper = glob(pattern_upper)
                logger.debug(f'Found {len(found_files_upper)} files with pattern `{pattern_upper}`.')
                image_files.extend(found_files_upper)

            if not image_files:
                logger.warning('No image files found in the image folder.')
                return

            logger.debug(f'total images: {len(image_files)}')
            random.shuffle(image_files)

            self.config['PROCESSING_STATUS']['total_count'] = len(image_files)
            self.config['PROCESSING_STATUS']['processed_count'] = 0

            batch_size = min(self.batch_size, 32)
            for i in range(0, len(image_files), batch_size):
                batch = image_files[i:i + batch_size]
                try:
                    self.process_images_batch(batch)
                    logger.debug(f'processed batch {i//batch_size + 1} / {len(image_files)//batch_size + 1}')
                except Exception as batch_error:
                    logger.error(f'{batch_error=}', exc_info=True)

        except Exception as db_init_error:
            logger.error(f'{db_init_error}', exc_info=True)
        finally:
            self.config['PROCESSING_STATUS']['is_processing'] = False
            self.initialization_complete = True
            processed_count = self.config['PROCESSING_STATUS']['processed_count']
            logger.info(f'db init: processed {processed_count} images.')

    def process_images_batch(self, image_paths: List[str]) -> None:
        new_files = []
        new_ids = []
        new_metadata = []

        for image_path in image_paths:
            try:
                filename = basename(image_path)
                logger.debug(f'processing image: {filename}')

                existing_entries = self.collection.get(
                    where={"filename": filename},
                    include=["embeddings"]
                )

                if existing_entries and len(existing_entries['ids']) > 0:
                    if existing_entries.get('embeddings', [None])[0] is not None:
                        logger.debug(f'embeddings: {filename}')
                        continue
                    else:
                        logger.warning(f'No embeddings: {filename}')

                file_id = str(uuid.uuid4())
                new_files.append(image_path)
                new_ids.append(file_id)
                new_metadata.append({
                    'type': 'image',
                    'filename': filename,
                    'original_path': image_path,
                    'processed': True
                })

            except Exception as image_error:
                logger.error(f'{image_error}', exc_info=True)
                continue

        if new_files:
            try:
                self.collection.add(
                    documents=new_files,
                    metadatas=new_metadata,
                    ids=new_ids
                )
                self.config['PROCESSING_STATUS']['processed_count'] += len(new_files)
            except Exception as batch_add_error:
                logger.error(f'{batch_add_error=}', exc_info=True)

    def perform_search(
        self,
        query_type: str,
        query: str = None,
        query_path: str = None,
        limit: int = None,
    ) -> Dict:
        logger.debug(f'search: {query_type=}, {query=}, {query_path=}')

        try:
            if query_type == 'text':
                if not query:
                    raise ValueError('No query input provided.')
                results = self.collection.query(
                    query_texts=[query],
                    n_results=limit,
                    include=['metadatas', 'distances', 'documents']
                )
            elif query_type == 'image':
                if not query_path:
                    raise ValueError('No query image provided.')
                results = self.collection.query(
                    query_texts=[query_path],
                    n_results=limit,
                    include=['metadatas', 'distances', 'documents']
                )
            else:
                raise ValueError('Invalid search type.')

            return self._format_search_results(results, query_type, query_path, limit)

        except Exception as db_search_error:
            logger.error(f'{db_search_error=}', exc_info=True)
            raise

    def get_image_url(self, doc):
        db_name = self.db_name.split('_')[0]
        output = f'/images/{filename}?dataset_id={db_name}'
        if 'uploads' in doc:
            output = f'/uploads/{filename}?dataset_id={db_name}'
        return output

    def _format_search_results(
        self,
        results: Dict,
        query_type: str,
        query_path: str = None,
        limit: int = 100
    ) -> Dict:

        unique_results = []
        seen_files = set()

        for idx, (doc, metadata, distance) in enumerate(zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        )):
            if query_type == 'image' and doc == query_path:
                continue

            filename = basename(doc)
            if filename in seen_files:
                continue

            seen_files.add(filename)

            is_upload = exists(join(self.config['UPLOAD_FOLDER'], filename))
            db_name = self.db_name.split('_')[0]
            url = f"/uploads/{filename}?dataset_id={db_name}" if is_upload \
                else f"/images/{filename}?dataset_id={db_name}"

            result = {
                'path': doc,
                'filename': filename,
                'url': url,
                'distance': float(distance),
                'metadata': metadata,
                'rank': idx + 1
            }

            unique_results.append(result)

        unique_results.sort(key=lambda x: x['distance'])
        unique_results = unique_results[:limit]

        for idx, result in enumerate(unique_results):
            result['rank'] = idx + 1

        return dict(results=unique_results, tital=len(unique_results), query_type=query_type)
