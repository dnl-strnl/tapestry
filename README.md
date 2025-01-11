# tapestry

![chromadb](https://img.shields.io/static/v1?label=chromadb&message=0.6.0&color=4d80f7)
![torchserve](https://img.shields.io/static/v1?label=torchserve&message=0.8.1&color=dc5837)
![flask](https://img.shields.io/static/v1?label=flask&message=3.1.0&color=5da8bc)
![hydra-core](https://img.shields.io/static/v1?label=hydra-core&message=3.1.0&color=386373)

<p align="center">
    <br>
    <img src="assets/t.png" width="30%"/>
    </br>
</p>

<p align="center">
    <br>
    <img src="assets/demo.gif" width="100%"/>
    </br>
</p>

---

<h3 align="center"> Multimodal Image Curation Gallery </h3>

---

### Features

- Enables searching, sorting, and filtering large image datasets through language and vision queries.
- Provides a simple and extensible multimodal vector database management system for [ChromaDB](https://www.trychroma.com/).
- Supports plug-and-play embedding models for both image and text using a local [TorchServe](https://pytorch.org/serve/) instance.
- Employs RESTful API endpoints for seamless integration with other applications via [Flask](https://flask.palletsprojects.com/en/stable/).
- Offers a responsive, grid-based gallery for browsing, curating, and exporting data.
- Leverages flexible and elegant application configuration with [Hydra](https://hydra.cc/).

### Quickstart
Install the package:
```bash
poetry install
```
Create a servable embedding model artifact:
```bash
bash models/make-mobileclip.sh s0
```
Serve the model via TorchServe:
```bash
poetry run torchserve --start --ncs --model-store models/ --models mobileclip_s0.mar
```
Copy an input image directory to `data/images` and start the Flask application:
```bash
poetry run python -m tapestry.app
```
