from flask import jsonify, request, send_file
import io
import json
import os
import sqlite3
from typing import Dict, List, Optional
import uuid
import zipfile

class CollectionManager:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS collection_items (
                    collection_id TEXT,
                    image_path TEXT,
                    position INTEGER,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
                    PRIMARY KEY (collection_id, image_path)
                )
            ''')
            conn.commit()

    def create_collection(self, name: str) -> Dict:
        collection_id = str(uuid.uuid4())
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'INSERT INTO collections (id, name) VALUES (?, ?)',
                (collection_id, name)
            )
            conn.commit()
        return dict(id=collection_id, name=name)

    def get_collections(self) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id, name FROM collections ORDER BY created_at DESC')
            return [{'id': row[0], 'name': row[1]} for row in cursor.fetchall()]

    def update_collection(self, collection_id: str, name: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                'UPDATE collections SET name = ? WHERE id = ?',
                (name, collection_id)
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_collection(self, collection_id: str) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM collections WHERE id = ?', (collection_id,))
            conn.commit()
            return cursor.rowcount > 0

    def export_collection(self, collection_id: str) -> io.BytesIO:
        memory_file = io.BytesIO()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT name FROM collections WHERE id = ?', (collection_id,))
            collection_name = cursor.fetchone()[0]

            cursor.execute('''
                SELECT image_path, position
                FROM collection_items
                WHERE collection_id = ?
                ORDER BY position
            ''', (collection_id,))

            images = [{'path': row[0], 'position': row[1]} for row in cursor.fetchall()]

            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                image_data = [
                    dict(filename=os.path.basename(img['path']), index=i) \
                        for i,img in enumerate(images)
                ]
                metadata = dict(id=collection_id, name=collection_name, images=image_data)
                zf.writestr('metadata.json', json.dumps(metadata, indent=2))
                for img in images:
                    image_path = img['path']
                    if os.path.isfile(image_path):
                        zf.write(image_path, os.path.basename(image_path))

        memory_file.seek(0)
        return memory_file

    def add_images_to_collection(
        self,
        collection_id: str,
        image_paths: List[str],
        positions: Optional[List[int]] = None
    ) -> bool:
        if positions is None:
            with sqlite3.connect(self.db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    'SELECT COALESCE(MAX(position), -1) FROM collection_items WHERE collection_id = ?',
                    (collection_id,)
                )
                max_position = cursor.fetchone()[0]
                positions = list(range(max_position + 1, max_position + 1 + len(image_paths)))

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.executemany(
                'INSERT OR REPLACE INTO collection_items (collection_id, image_path, position) VALUES (?, ?, ?)',
                [(collection_id, path, pos) for path, pos in zip(image_paths, positions)]
            )
            conn.commit()
            return True

    def remove_images_from_collection(self, collection_id: str, image_paths: List[str]) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.executemany(
                'DELETE FROM collection_items WHERE collection_id = ? AND image_path = ?',
                [(collection_id, path) for path in image_paths]
            )
            conn.commit()
            return cursor.rowcount > 0

    def get_collection_images(self, collection_id: str) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                '''
                SELECT image_path, position
                FROM collection_items
                WHERE collection_id = ?
                ORDER BY position
                ''',
                (collection_id,)
            )
            return [{'path': row[0], 'position': row[1]} for row in cursor.fetchall()]

    def update_image_positions(self, collection_id: str, position_updates: List[Dict[str, int]]) -> bool:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.executemany(
                'UPDATE collection_items SET position = ? WHERE collection_id = ? AND image_path = ?',
                [(update['position'], collection_id, update['path']) for update in position_updates]
            )
            conn.commit()
            return cursor.rowcount > 0

def register_collection_routes(app, collections_manager):
    @app.route('/collections', methods=['GET'])
    def get_collections():
        try:
            collections = collections_manager.get_collections()
            return jsonify(dict(collections=collections))
        except Exception as get_collections_exception:
            return jsonify(dict(error=get_collections_exception)), 500

    @app.route('/collections', methods=['POST'])
    def create_collection():
        try:
            data = request.get_json()
            name = data.get('name')
            if not name:
                return jsonify(dict(error='Collection name is required.')), 400
            collection = collections_manager.create_collection(name)
            return jsonify(collection), 201
        except Exception as create_collection_exception:
            return jsonify(dict(error=create_collection_exception)), 500

    @app.route('/collections/<collection_id>', methods=['GET'])
    def get_collection(collection_id):
        try:
            images = collections_manager.get_collection_images(collection_id)
            return jsonify(dict(images=images))
        except Exception as get_collection_exception:
            return jsonify(dict(error=get_collection_exception)), 500

    @app.route('/collections/<collection_id>', methods=['PATCH'])
    def update_collection(collection_id):
        try:
            data = request.get_json()
            name = data.get('name')
            if not name:
                return jsonify(dict(error='Collection name is required.')), 400

            success = collections_manager.update_collection(collection_id, name)
            if success:
                return jsonify(dict(message='Collection updated successfully!'))
            return jsonify(dict(error='Collection not found.')), 404
        except Exception as update_collection_exception:
            return jsonify(dict(error=update_collection_exception)), 500

    @app.route('/collections/<collection_id>', methods=['DELETE'])
    def delete_collection(collection_id):
        try:
            success = collections_manager.delete_collection(collection_id)
            if success:
                return jsonify(dict(message='Collection deleted successfully!'))
            return jsonify(dict(error='Collection not found.')), 404
        except Exception as delete_collection_exception:
            return jsonify(dict(error=delete_collection_exception)), 500

    @app.route('/collections/<collection_id>/images', methods=['POST'])
    def add_images_to_collection(collection_id):
        try:
            data = request.get_json()
            image_paths = data.get('image_paths', [])
            positions = data.get('positions')

            if not image_paths:
                return jsonify(dict(error='Image paths are required.')), 400

            success = collections_manager.add_images_to_collection(
                collection_id, image_paths, positions
            )

            if success:
                return jsonify(dict(message='Images added successfully!'))
            return jsonify(dict(error='Failed to add images.')), 500
        except Exception as add_to_collection_exception:
            return jsonify(dict(error=add_to_collection_exception)), 500

    @app.route('/collections/<collection_id>/images', methods=['DELETE'])
    def remove_images_from_collection(collection_id):
        try:
            data = request.get_json()
            image_paths = data.get('image_paths', [])

            if not image_paths:
                return jsonify(dict(error='Image paths are required.')), 400

            success = collections_manager.remove_images_from_collection(
                collection_id, image_paths
            )

            if success:
                return jsonify(dict(message='Images removed successfully!'))
            return jsonify(dict(error='Failed to remove images.')), 500
        except Exception as remove_image_exception:
            return jsonify(dict(error=remove_image_exception)), 500

    @app.route('/collections/<collection_id>/positions', methods=['PATCH'])
    def update_image_positions(collection_id):
        try:
            data = request.get_json()
            position_updates = data.get('positions', [])

            if not position_updates:
                return jsonify(dict(error='Position updates are required.')), 400

            success = collections_manager.update_image_positions(
                collection_id, position_updates
            )

            if success:
                return jsonify(dict(message='Positions updated successfully!'))
            return jsonify(dict(error='Failed to update positions.')), 500
        except Exception as update_position_exception:
            return jsonify(dict(error=update_position_exception)), 500

    @app.route('/collections/<collection_id>/export', methods=['GET'])
    def export_collection(collection_id):
        try:
            memory_file = collections_manager.export_collection(collection_id)
            return send_file(
                memory_file,
                mimetype='application/zip',
                as_attachment=True,
                download_name=f'{collection_id}-collection.zip'
            )
        except Exception as export_collection_error:
            return jsonify(dict(error=export_collection_error)), 500

    return app
