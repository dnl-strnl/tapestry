from flask import jsonify
import logging
import os
from typing import Dict, List, Optional

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class DatasetConfig:
    def __init__(self, dataset_id: str, data_path: str):
        self.id = dataset_id
        self.name = dataset_id
        self.data_path = data_path
        self.image_folder = os.path.join(data_path, 'images')
        self.db_path = os.path.join(data_path, 'chroma_db')
        self.db_name = f'{dataset_id}_images'

class DatasetManager:
    def __init__(self, base_path: str):
        '''Initialize with base path where datasets are stored.'''
        self.base_path = os.path.join(base_path, 'datasets')
        self.datasets: Dict[str, DatasetConfig] = {}
        self.load_datasets()

    def load_datasets(self):
        '''Load datasets by scanning directories.'''
        self.datasets.clear()
        logger.debug(f'Loading datasets from: {self.base_path}')

        try:
            found_entries = os.listdir(self.base_path)
            logger.debug(f'{found_entries=}')

            for entry in found_entries:
                dataset_path = os.path.join(self.base_path, entry)
                images_path = os.path.join(dataset_path, 'images')
                db_path = os.path.join(dataset_path, 'chroma_db')

                if os.path.isdir(dataset_path) and os.path.exists(images_path):
                    dataset = DatasetConfig(
                        dataset_id=entry,
                        data_path=dataset_path
                    )
                    self.datasets[entry] = dataset
                    logger.debug(f'Added dataset: {entry}')

            logger.debug(f'Total datasets loaded: {len(self.datasets)}')
        except Exception as load_datasets_error:
            logger.error(f'{load_datasets_error=}', exc_info=True)

    def get_dataset(self, dataset_id: str) -> Optional[DatasetConfig]:
        '''Get dataset by ID.'''
        dataset = self.datasets.get(dataset_id)
        return dataset

    def list_datasets(self) -> List[Dict[str, str]]:
        '''List all available datasets.'''
        datasets = [dict(id=dataset.id, name=dataset.name) for dataset in self.datasets.values()]
        return datasets

    def refresh(self):
        '''Refresh the dataset list by rescanning directories.'''
        self.load_datasets()
