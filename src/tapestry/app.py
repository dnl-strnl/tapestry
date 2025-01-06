from flask import Flask, request, jsonify, render_template, send_from_directory, url_for
import hydra
import os
from os.path import basename, exists, join, splitext
from werkzeug.utils import secure_filename
from omegaconf import DictConfig
import pathlib
import uuid

from tapestry.collection import CollectionManager, register_collection_routes
from tapestry.database import DatabaseManager

PROJECT_ROOT = pathlib.Path(__file__).parent.parent.parent
DATA_DIR = PROJECT_ROOT / 'data'

def make_app(cfg):
    app = Flask(__name__)

    app.config['IMAGE_FOLDER'] = str(DATA_DIR / 'images')
    app.config['UPLOAD_FOLDER'] = str(DATA_DIR / 'uploads')
    app.config['COLLECTIONS_DB'] = str(DATA_DIR / 'collections.db')
    app.config['PROCESSING_STATUS'] = {
        'is_processing': False, 'processed_count': 0, 'total_count': 0
    }
    app.config['FAVICON_IMAGE'] = str(DATA_DIR / 'favicon.ico')

    images_per_page = cfg.images_per_page
    db_result_limit = cfg.db_result_limit

    db_manager = DatabaseManager(
        app.config,
        cfg.db_path,
        cfg.db_name,
        cfg.db_meta,
        cfg.embedding_model_address,
        cfg.embedding_dimension,
        cfg.embedding_image_size,
        cfg.image_extensions,
        cfg.embedding_batch_size,
    )

    db_manager.start_initialization()

    collection_manager = CollectionManager(app.config['COLLECTIONS_DB'])
    collection_manager.init_db()

    app = register_collection_routes(app, collection_manager)

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/uploads/<filename>')
    def uploaded_file(filename):
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

    @app.route('/images/<path:filename>')
    def serve_image(filename):
        return send_from_directory(app.config['IMAGE_FOLDER'], filename)

    @app.route('/static/<path:path>')
    def serve_static(path):
        return send_from_directory('static', path)

    @app.route('/upload', methods=['POST'])
    def upload_image():
        if 'file' not in request.files:
            return jsonify({'error': 'No file part.'}), 400
        file = request.files['file']

        if file.filename == '':
            return jsonify({'error': 'No selected file.'}), 400

        if file:

            filename = secure_filename(
                str(uuid.uuid4()) + splitext(file.filename)[1]
            )
            filepath = join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            return jsonify({
                'success': True, 'filename': filename, 'isQueryImage': True
            })

    @app.route('/search', methods=['POST'])
    def search():
        data = request.get_json()
        query_type = data.get('type')
        limit = db_result_limit
        # limit = data.get('limit', images_per_page)

        try:
            if query_type == 'text':
                query = data.get('query', '').strip()
                results = db_manager.perform_search(
                    query_type, query=query, limit=limit
                )
            elif query_type == 'image':
                query_image = data.get('image')
                if not query_image:
                    return jsonify({'error': 'No query image provided.'}), 400

                upload_path = join(app.config['UPLOAD_FOLDER'], query_image)
                image_path = join(app.config['IMAGE_FOLDER'], query_image)

                if exists(upload_path):
                    query_path = upload_path
                elif exists(image_path):
                    query_path = image_path
                else:
                    return jsonify({'error': 'Query image not found.'}), 404

                results = db_manager.perform_search(
                    query_type, query_path=query_path, limit=limit
                )
            else:
                return jsonify({'error': 'Invalid search type.'}), 400
            return jsonify(results)
        except Exception as search_exception:
            return jsonify({'error': f"{search_exception=}"}), 500

    @app.route('/get-all-images')
    def get_all_images():
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', images_per_page))
        results = db_manager.collection.get()

        unique_images = {}
        for doc, metadata in zip(results['documents'], results['metadatas']):
            filename = basename(doc)

            if exists(join(app.config['IMAGE_FOLDER'], filename)):
                url = f'/images/{filename}'
            else:
                url = f'/uploads/{filename}'

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
            'processing_status': app.config['PROCESSING_STATUS']
        })

    @app.route('/processing-status')
    def processing_status():
        return jsonify(app.config['PROCESSING_STATUS'])

    @app.route('/remove-temp', methods=['POST'])
    def remove_temp_files():
        try:
            db_manager.remove_temp_files()
            return jsonify(
                {'success': True, 'message': 'Temporary files removed.'}
            )
        except Exception as remove_files_exception:
            return jsonify({'error': f"{remove_files_exception=}"}), 500

    return app

@hydra.main(version_base=None, config_path="config", config_name="app")
def main(cfg: DictConfig):
    app = make_app(cfg)
    app.run(debug=True)

if __name__ == "__main__":
    main()
