import base64
import io
import json
import logging
import numpy as np
import os
from PIL import Image
import requests
from typing import Any, Dict, List

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

def process_image(image_path: str, image_size:tuple) -> str:
    try:
        with Image.open(image_path).convert('RGB') as image:
            if image_size:
                image = image.resize(image_size)
            image_bytes = io.BytesIO()
            image.save(image_bytes, format='PNG')
            image_bytes = image_bytes.getvalue()
            return base64.b64encode(image_bytes).decode('utf-8')
    except Exception as image_processing_exception:
        log.error(f"{image_processing_exception=}")
        raise

def get_embeddings(
        embedding_model_address: str,
        image_path: str = None,
        text_string: str = None,
        embedding_dim: int = 512,
        image_size: tuple = (1024,1024),
        timeout: int = 10,
    ) -> Dict[str, np.ndarray]:
    embeddings = {}
    try:
        if image_path is not None:

            response = requests.post(
                embedding_model_address,
                json=dict(image=process_image(image_path, image_size)),
                timeout=timeout
            )

            if response.status_code == 200:
                response_data = response.json()
                if isinstance(response_data, dict) and 'body' in response_data:
                    body_data = json.loads(response_data['body'])
                    if 'image' in body_data:
                        embedding = np.array(body_data['image'][0], dtype=np.float32)
                        embeddings['image'] = embedding
                        log.info(f'{image_path}')
                    else:
                        raise KeyError("No 'image' field in response body.")
                else:
                    raise KeyError("No 'body' field in response.")
            else:
                raise Exception(f"error: {response.text=}")

        if text_string is not None:

            response = requests.post(
                embedding_model_address,
                json=dict(text=text_string),
                timeout=timeout
            )

            if response.status_code == 200:
                response_data = response.json()
                if isinstance(response_data, dict) and 'body' in response_data:
                    body_data = json.loads(response_data['body'])
                    if 'text' in body_data:
                        embedding = np.array(body_data['text'][0], dtype=np.float32)
                        embeddings['text'] = embedding
                        log.info(f'{text_string}')
                    else:
                        raise KeyError("No 'text' field in response body.")
                else:
                    raise KeyError("No 'body' field in response.")
            else:
                raise Exception(f"error: {response.text=}")

    except requests.exceptions.RequestException as embedding_exception:
        log.error(f"{embedding_exception=}")

    return embeddings

class Embedder:
    def __init__(
        self,
        embedding_model_address:str,
        embedding_dimension:int,
        embedding_image_size:tuple,
    ):
        self.embedding_model_address = embedding_model_address
        self.embedding_dimension = embedding_dimension
        self.embedding_image_size = embedding_image_size

    def __call__(self, input: List[str]) -> List[np.ndarray]:
        embeddings = []

        for data in input:
            try:
                if os.path.isfile(data):
                    emb_dict = get_embeddings(
                        image_path=data,
                        embedding_model_address=self.embedding_model_address,
                        embedding_dim=self.embedding_dimension,
                        image_size=self.embedding_image_size
                    )
                    embeddings.append(emb_dict['image'])
                else:
                    emb_dict = get_embeddings(
                        text_string=data,
                        embedding_model_address=self.embedding_model_address,
                        embedding_dim=self.embedding_dimension,
                    )
                    embeddings.append(emb_dict['text'])
            except Exception as embedding_exception:
                log.error(f"{embedding_exception=}")

        return embeddings
