from flask import Flask, request, jsonify, render_template, send_from_directory, url_for
import hydra
from omegaconf import DictConfig
import os
from os.path import basename, exists, join, splitext
import pathlib
import uuid
from werkzeug.utils import secure_filename

from tapestry.collection import CollectionManager, register_collection_routes
from tapestry.database import DatabaseManager
from tapestry.dataset import DatasetManager

PROJECT_ROOT = pathlib.Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'

def make_app(cfg):
    app = Flask(__name__)

    app.config['DATA_DIR'] = str(DATA_DIR)
    app.config['COLLECTIONS_DB'] = str(DATA_DIR / 'collections.db')

    dataset_manager = DatasetManager(str(DATA_DIR))
    db_managers = {}

    collection_manager = CollectionManager(app.config['COLLECTIONS_DB'])
    collection_manager.init_db()

    def get_or_create_db_manager(dataset_id: str) -> DatabaseManager:
        if dataset_id not in db_managers:
            dataset = dataset_manager.get_dataset(dataset_id)
            if not dataset:
                raise ValueError(f'{dataset_id=}')

            db_manager = DatabaseManager(
                {
                    'IMAGE_FOLDER': dataset.image_folder,
                    'UPLOAD_FOLDER': os.path.join(dataset.data_path, 'uploads'),
                    'PROCESSING_STATUS': {
                        'is_processing': False,
                        'processed_count': 0,
                        'total_count': 0
                    }
                },
                dataset.db_path,
                dataset.db_name,
                cfg.db_meta,
                cfg.embedding_model_address,
                cfg.embedding_dimension,
                cfg.embedding_image_size,
                cfg.image_extensions,
                cfg.embedding_batch_size,
            )
            db_managers[dataset_id] = db_manager
            init_thread = db_manager.start_initialization()
            
        return db_managers[dataset_id]

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/upload', methods=['POST'])
    def upload_image():
        dataset_id = request.form.get('dataset_id')
        if not dataset_id:
            return jsonify(dict(error='Dataset ID is required.')), 400

        try:
            db_manager = get_or_create_db_manager(dataset_id)
        except ValueError as db_manager_upload_error:
            return jsonify(dict(error=f'{db_manager_upload_error=}')), 404

        if 'file' not in request.files:
            return jsonify(dict(error='No file part.')), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify(dict(error='No selected file.')), 400

        if file:
            uniqueid = str(uuid.uuid4()) + splitext(file.filename)[1]
            filename = secure_filename(uniqueid)
            filepath = join(db_manager.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            return jsonify({
                'success': True,
                'filename': filename,
                'isQueryImage': True
            })

    @app.route('/search', methods=['POST'])
    def search():
        data = request.get_json()
        dataset_id = data.get('dataset_id')
        if not dataset_id:
            return jsonify(dict(error='Dataset ID is required.')), 400

        try:
            db_manager = get_or_create_db_manager(dataset_id)
        except ValueError as db_manager_search_error:
            return jsonify(dict(error=f'{db_manager_search_error=}')), 404

        query_type = data.get('type')
        limit = cfg.db_result_limit

        try:
            if query_type == 'text':
                query = data.get('query', '').strip()
                results = db_manager.perform_search(query_type, query=query, limit=limit)
            elif query_type == 'image':
                query_image = data.get('image')
                if not query_image:
                    return jsonify(dict(error='No query image provided.')), 400

                upload_path = join(db_manager.config['UPLOAD_FOLDER'], query_image)
                image_path = join(db_manager.config['IMAGE_FOLDER'], query_image)

                if exists(upload_path):
                    query_path = upload_path
                elif exists(image_path):
                    query_path = image_path
                else:
                    return jsonify(dict(error='Query image not found.')), 404

                results = db_manager.perform_search(
                    query_type, query_path=query_path, limit=limit
                )
            else:
                return jsonify(dict(error='Invalid search type.')), 400
            return jsonify(results)
        except Exception as search_exception:
            return jsonify(dict(error=f'{search_exception=}')), 500

    @app.route('/get-all-images')
    def get_all_images():
        dataset_id = request.args.get('dataset_id')
        if not dataset_id:
            return jsonify(dict(error='Dataset ID is required.')), 400

        try:
            db_manager = get_or_create_db_manager(dataset_id)
        except ValueError as db_manager_images_error:
            return jsonify(dict(error=f'{db_manager_images_error=}')), 404

        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', cfg.images_per_page))
        results = db_manager.collection.get()

        unique_images = {}
        for doc, metadata in zip(results['documents'], results['metadatas']):
            filename = basename(doc)

            file_path = join(db_manager.config['UPLOAD_FOLDER'], filename)
            is_upload = exists(file_path)

            url = f'/images/{filename}?dataset_id={dataset_id}'
            if is_upload:
                url = f'/uploads/{filename}?dataset_id={dataset_id}'

            if filename not in unique_images:
                unique_images[filename] = {
                    'path': doc,
                    'metadata': metadata,
                    'filename': filename,
                    'url': url,
                    'prompt': metadata.get('prompt', f'{filename}'),
                }

        formatted_results = list(unique_images.values())
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_results = formatted_results[start_idx:end_idx]

        return jsonify({
            'images': paginated_results,
            'total': len(formatted_results),
            'has_more': end_idx < len(formatted_results),
            'processing_status': db_manager.config['PROCESSING_STATUS']
        })

    @app.route('/processing-status')
    def processing_status():
        dataset_id = request.args.get('dataset_id')
        if not dataset_id:
            return jsonify(dict(error='Dataset ID is required')), 400

        try:
            db_manager = get_or_create_db_manager(dataset_id)
            return jsonify(db_manager.config['PROCESSING_STATUS'])
        except ValueError as db_manager_status_error:
            return jsonify(dict(error=f'{db_manager_status_error=}')), 404

    @app.route('/remove-temp', methods=['POST'])
    def remove_temp_files():
        dataset_id = request.json.get('dataset_id')
        if not dataset_id:
            return jsonify(dict(error='Dataset ID is required')), 400

        try:
            db_manager = get_or_create_db_manager(dataset_id)
            db_manager.remove_temp_files()
            return jsonify({'success': True, 'message': 'Temporary files removed.'})
        except Exception as remove_files_exception:
            return jsonify(dict(error=f'{remove_files_exception=}')), 500

    @app.route('/uploads/<path:filename>')
    def uploaded_file(filename):
        dataset_id = request.args.get('dataset_id')
        if not dataset_id:
            return jsonify(dict(error='Dataset ID is required.')), 400

        try:
            db_manager = get_or_create_db_manager(dataset_id)
            return send_from_directory(db_manager.config['UPLOAD_FOLDER'], filename)
        except ValueError as upload_file_error:
            return jsonify(dict(error=f'{upload_file_error=}')), 404

    @app.route('/images/<path:filename>')
    def serve_image(filename):
        dataset_id = request.args.get('dataset_id')

        if not dataset_id:
            return jsonify(dict(error='Dataset ID is required.')), 400

        try:
            db_manager = get_or_create_db_manager(dataset_id)
            return send_from_directory(db_manager.config['IMAGE_FOLDER'], filename)
        except ValueError as serve_image_error:
            return jsonify(dict(error=f'{serve_image_error=}')), 404

    @app.route('/static/<path:path>')
    def serve_static(path):
        return send_from_directory('static', path)

    @app.route('/api/datasets', methods=['GET'])
    def list_datasets():
        return jsonify({'datasets': dataset_manager.list_datasets()})

    @app.route('/api/datasets', methods=['POST'])
    def create_dataset():
        data = request.get_json()
        name = data.get('name')
        if not name:
            return jsonify(dict(error='Dataset name is required.')), 400

        dataset = dataset_manager.add_dataset(name)
        get_or_create_db_manager(dataset.id)
        return jsonify(dict(id=dataset.id, name=dataset.name))

    @app.route('/api/datasets/<dataset_id>', methods=['DELETE'])
    def delete_dataset(dataset_id):
        if dataset_manager.remove_dataset(dataset_id):
            if dataset_id in db_managers:
                del db_managers[dataset_id]
            return jsonify(dict(message='Dataset removed successfully.'))
        return jsonify(dict(error='Dataset not found.')), 404

    app = register_collection_routes(app, collection_manager)
    return app

@hydra.main(version_base=None, config_path='config', config_name='app')
def main(cfg: DictConfig):
    try:
        app = make_app(cfg)
        app.run(debug=True)
    except KeyboardInterrupt:
        print('\nShutting down...')

if __name__ == '__main__':
    main()
