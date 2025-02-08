window.utils = {
    getImageUrl: function(image, currentDataset) {

        // use the `dataset_id` from the image's path for collection images.
        if (image.path && typeof image.path === 'string') {
            const pathParts = image.path.split('/');
            const datasetIndex = pathParts.indexOf('datasets');
            if (datasetIndex !== -1 && pathParts.length > datasetIndex + 1) {
                const imageDatasetId = pathParts[datasetIndex + 1];
                const filename = pathParts[pathParts.length - 1];

                if (image.path.includes('uploads')) {
                    return `/uploads/${filename}?dataset_id=${imageDatasetId}`;
                }
                return `/images/${filename}?dataset_id=${imageDatasetId}`;
            }
        }

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
