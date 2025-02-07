import base64
import io
import json
import os
from PIL import Image
import sys
import torch
from ts.torch_handler.base_handler import BaseHandler

class Handler(BaseHandler):
    def __init__(self, **kwargs):
        self._context = None
        self.device = None
        self.initialized = False
        self.model = None
        self.tokenizer = None

    def initialize(self, context):
        self.manifest = context.manifest
        props = context.system_properties
        gpuid = props.get('gpu_id')

        if torch.cuda.is_available() and gpuid is not None:
            self.map_location = 'cuda'
            self.device = torch.device(f'cuda:{gpuid}')
        elif torch.backends.mps.is_available():
            self.map_location = 'mps'
            self.device = torch.device('mps')
        else:
            self.map_location = 'cpu'
            self.device = torch.device('cpu')

        sys.path.insert(0, 'ml-mobileclip')
        import mobileclip
        model_file = [f for f in os.listdir('.') if f.endswith('.pt')][0]
        model_version = os.path.splitext(model_file)[0]
        self.model, _, self.preprocess = mobileclip.create_model_and_transforms(
            model_version, pretrained=model_file
        )
        self.tokenizer = mobileclip.get_tokenizer(model_version)
        self.model.to(self.device)
        self.initialized = True

    def handle(self, data, context):
        json_data = data[0].get('body')
        if isinstance(json_data, (str, bytes)):
            json_data = json.loads(json_data)

        response = {}
        if 'image' in json_data:
            image_data = base64.b64decode(json_data['image'])
            image_bytes = io.BytesIO(image_data)
            image = Image.open(image_bytes).convert('RGB')
            image_tensor = self.preprocess(image).unsqueeze(0)
            image_tensor = image_tensor
            image_features = self.predict_image(image_tensor)
            response['image'] = image_features.cpu().numpy().tolist()

        if 'text' in json_data:
            text = json_data['text']
            if isinstance(text, str):
                text = [text]
            text_features = self.predict_text(text)
            response['text'] = text_features.cpu().numpy().tolist()

        return [{"body": json.dumps(response)}]

    def predict_image(self, image):
        with torch.no_grad(), torch.cuda.amp.autocast():
            image_features = self.model.encode_image(image.to(self.device))
            image_features /= image_features.norm(dim=-1, keepdim=True)
        return image_features

    def predict_text(self, text):
        text_input = self.tokenizer(text).to(self.device)
        with torch.no_grad(), torch.cuda.amp.autocast():
            text_features = self.model.encode_text(text_input)
            text_features /= text_features.norm(dim=-1, keepdim=True)
        return text_features
