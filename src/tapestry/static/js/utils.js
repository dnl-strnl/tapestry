window.utils = {
    getImageUrl: function(image, currentDataset) {
        if (image.url && image.url.includes('dataset_id=')) {
            return image.url;
        }

        let filename = image.path || image.filename;
        if (filename.includes('/')) {
            filename = filename.split('/').pop();
        }

        const datasetParam = `dataset_id=${currentDataset}`;
        if (image.url) {
            return `${image.url}${image.url.includes('?') ? '&' : '?'}${datasetParam}`;
        }

        // Check uploads folder.
        if (image.path && image.path.includes('uploads')) {
            return `/uploads/${filename}?${datasetParam}`;
        }

        // Default to images folder.
        return `/images/${filename}?${datasetParam}`;
    }
};
