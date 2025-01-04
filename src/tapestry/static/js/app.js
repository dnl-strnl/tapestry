// State management.
const state = {
    currentPage: 1,
    isLoading: false,
    hasMore: true,
    isSearching: false,
    gridWidth: 4,
    allImageData: [],
    isDragging: false,
    dragIntent: null,
    draggedIndex: null
};

// DOM Elements.
const elements = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    imageGrid: document.getElementById('imageGrid'),
    searchBar: document.querySelector('.search-bar'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    processingStatus: document.getElementById('processingStatus'),
    gridWidth: document.getElementById('gridWidth'),
    collectionsSidebar: document.getElementById('collectionsSidebar')
};

const logger = {
    info: (message, data) => {
        console.log(`[INFO] ${message}`, data || '');
    },
    error: (message, error) => {
        console.error(`[ERROR] ${message}`, error);
    }
};

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedSearch = debounce((query) => {
    if (query) {
        state.isSearching = true;
        performSearch('text', query);
      } else {
        state.isSearching = false;
        state.currentPage = 1;
        loadImages();
    }
}, 300);

function getImageUrl(image) {
    if (image.url) return image.url;
    let filename = image.path || image.filename;
    if (filename.includes('/')) {
        filename = filename.split('/').pop();
    }
    return `/images/${filename}`;
}

function updateGridLayout() {
    const containerWidth = elements.imageGrid.offsetWidth;
    const columnWidth = Math.floor(containerWidth / state.gridWidth);

    elements.imageGrid.style.display = 'grid';
    elements.imageGrid.style.gridTemplateColumns = `repeat(${state.gridWidth}, 1fr)`;
    elements.imageGrid.style.gap = '16px';
    elements.imageGrid.style.width = '100%';
    elements.imageGrid.style.padding = '16px';
    elements.imageGrid.style.boxSizing = 'border-box';
}

function handleDragStart(e, index) {
    state.draggedIndex = index;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    state.draggedIndex = null;
}

async function handleDragOver(e, index) {
    e.preventDefault();
    if (state.draggedIndex === null) return;
    if (index === state.draggedIndex) return;

    const newImages = [...state.allImageData];
    const draggedItem = newImages[state.draggedIndex];

    // Remove dragged item from array and insert at new position.
    newImages.splice(state.draggedIndex, 1);
    newImages.splice(index, 0, draggedItem);

    // Update local state immediately.
    state.allImageData = newImages;
    state.draggedIndex = index;

    // Update UI.
    displayResults(newImages);

    // Create positions array for backend update.
    const positions = newImages.map((item, idx) => ({
        path: item.path || item.filename,
        position: idx
    }));

    // Update backend.
    try {
        await updateCollectionOrder(positions);
    } catch (error) {
        console.error('Error updating collection order:', error);
        // Reload images to restore correct order if update fails
        await loadImages();
    }
}

function displayResults(results, append = false) {
    if (!append) {
        elements.imageGrid.innerHTML = '';
    }

    updateGridLayout();

    if (!results || results.length === 0) {
        elements.imageGrid.innerHTML = '<p>No images found</p>';
        return;
    }

    results.forEach((result, index) => {
        const div = document.createElement('div');
        div.className = 'image-item';
        div.draggable = true;

        // Calculate the current position in the overall dataset.
        const globalIndex = append ? state.allImageData.length - results.length + index : index;

        const img = document.createElement('img');
        img.src = getImageUrl(result);
        img.alt = result.filename || result.path;
        img.loading = 'lazy';
        img.className = 'w-full h-full object-cover';

        // Add drag event listeners for collection reordering.
        if (state.activeCollection) {
            div.addEventListener('dragstart', (e) => handleDragStart(e, index));
            div.addEventListener('dragend', handleDragEnd);
            div.addEventListener('dragover', (e) => handleDragOver(e, index));
        } else {
            // Regular drag behavior for non-collection view.
            div.addEventListener('dragstart', (e) => {
                state.isDragging = true;
                state.dragIntent = null;
                const imageData = {
                    type: 'internal',
                    path: result.path || result.filename
                };
                e.dataTransfer.setData('application/json', JSON.stringify(imageData));
                e.dataTransfer.effectAllowed = 'copy';
            });
        }

        div.appendChild(img);
        elements.imageGrid.appendChild(div);

        // Add click event listener for preview.
        div.addEventListener('click', () => showImagePreview(globalIndex));
    });
}

async function loadImages(page = 1, append = false) {
    if (state.isLoading || (!append && state.isSearching)) return;

    state.isLoading = true;
    elements.loadingIndicator.style.display = 'block';

    try {
        let url = state.activeCollection
            ? `/collections/${state.activeCollection}`
            : `/get-all-images?page=${page}&per_page=1000`;

        const response = await fetch(url);
        const data = await response.json();

        if (!append) {
            state.allImageData = [];
        }

        let processedImages;
        if (state.activeCollection) {
            processedImages = (data.images || []).map(img => ({
                path: img.path,
                filename: img.path,
                prompt: img.prompt || img.filename || img.path,
                url: getImageUrl(img)
            }));
        } else {
            // Handle regular image grid format.
            processedImages = (data.images || []).map(img => ({
                filename: img.filename || img.path || img,
                url: img.url || `/images/${img.filename || img.path || img}`,
                prompt: img.prompt || img.filename,
                ...img
            }));
        }

        if (append) {
            state.allImageData = [...state.allImageData, ...processedImages];
        } else {
            state.allImageData = processedImages;
        }

        displayResults(processedImages, append);

        state.hasMore = data.has_more;
        if (data.processing_status) {
            updateProcessingStatus(data.processing_status);
        }

    } catch (error) {
        console.error('Error loading images:', error);
        elements.imageGrid.innerHTML = '<p>Error loading images</p>';
    } finally {
        state.isLoading = false;
        elements.loadingIndicator.style.display = 'none';
    }
}

elements.gridWidth.addEventListener('change', (e) => {
    const containerWidth = elements.imageGrid.offsetWidth;
    const maxColumns = Math.floor(containerWidth / 100); // Minimum 100px per column
    const newWidth = Math.min(maxColumns, Math.max(1, parseInt(e.target.value, 10)));

    state.gridWidth = newWidth;
    e.target.value = newWidth;
    localStorage.setItem('preferredGridWidth', newWidth);

    // Update the grid layout.
    updateGridLayout();
    if (state.allImageData.length > 0) {
        displayResults(state.allImageData);
    }
});

function initializeCollectionsSidebar() {
    const sidebarElement = document.getElementById('collectionsSidebar');
    if (!sidebarElement) {
        console.error('Collections sidebar element not found!');
        return;
    }

    // Add drag enter/over handlers for collections.
    sidebarElement.addEventListener('dragenter', (e) => {
        if (state.isDragging) {
            e.preventDefault();
            state.dragIntent = 'collection';
        }
    });

    sidebarElement.addEventListener('dragover', (e) => {
        if (state.isDragging) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    // Add drop handler for collections.
    sidebarElement.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.type === 'internal' && data.path) {
                await addImageToCollection(data.path);
            }
        } catch (error) {
            logger.error('Error handling collection drop:', error);
        }

        state.isDragging = false;
        state.dragIntent = null;
    });

    try {
        const root = ReactDOM.createRoot(sidebarElement);
        root.render(React.createElement(window.CollectionsSidebar, {
            onCollectionSelect: handleCollectionSelect,
            activeCollection: state.activeCollection || null
        }));
    } catch (error) {
        console.error('Error rendering collections sidebar:', error);
    }
}

async function performSearch(type, query, image = null) {
    if (state.isLoading) return;

    state.isLoading = true;
    state.isSearching = true;
    elements.loadingIndicator.style.display = 'block';

    try {
        const response = await fetch('/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, query, image, limit: 20 })
        });

        const data = await response.json();
        if (!data || data.error) {
            throw new Error(data.error || 'Search failed');
        }

        state.allImageData = data.results || [];
        displayResults(data.results || [], false);

    } catch (error) {
        logger.error('Search error:', error);
        elements.imageGrid.innerHTML = '<p class="error-message">Search failed</p>';
    } finally {
        state.isLoading = false;
        elements.loadingIndicator.style.display = 'none';
    }
}

function showImagePreview(index) {
    if (!state.allImageData || !state.allImageData.length) {
        logger.error('No image data available');
        return;
    }

    // Remove any existing preview container.
    const existingContainer = document.getElementById('previewContainer');
    if (existingContainer) {
        existingContainer.remove();
    }

    // Create new container.
    const previewContainer = document.createElement('div');
    previewContainer.id = 'previewContainer';
    document.body.appendChild(previewContainer);

    try {
        const root = ReactDOM.createRoot(previewContainer);
        // Create the modal element with the correct data.
        const modalElement = React.createElement(window.ImagePreviewModal, {
            images: state.allImageData,
            initialIndex: index,
            onClose: () => {
                root.unmount();
                previewContainer.remove();
            }
        });
        // Render the modal.
        root.render(modalElement);
        logger.info('Modal rendered successfully with index:', index);
    } catch (error) {
        logger.error('Error rendering preview modal:', error);
    }
}

async function handleImageUpload(file) {
    elements.loadingIndicator.style.display = 'block';

    try {
        logger.info('Uploading image:', file.name);
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            logger.info('Image uploaded successfully:', data.filename);

            if (state.activeCollection) {
                await addImageToCollection(data.filename);
            } else {
                await performSearch('image', null, data.filename);
            }
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        logger.error('Error uploading image:', error);
    } finally {
        elements.loadingIndicator.style.display = 'none';
    }
}


function updateDraggableState() {
    const imageItems = document.querySelectorAll('.image-item');
    imageItems.forEach(item => {
        if (state.activeCollection) {
            item.classList.add('collection-draggable');
        } else {
            item.classList.remove('collection-draggable');
        }
    });
}

async function handleCollectionSelect(collectionId) {
    state.activeCollection = collectionId;
    state.currentPage = 1;
    state.isSearching = false;
    state.isDragging = false;
    state.dragIntent = null;
    await loadImages();
}

async function addImageToCollection(imagePath) {
    if (!state.activeCollection) return;

    try {
        const response = await fetch(`/collections/${state.activeCollection}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_paths: [imagePath]
            })
        });

        if (!response.ok) {
            throw new Error('Failed to add image to collection');
        }

        await loadImages();
    } catch (error) {
        logger.error('Error adding image to collection:', error);
    }
}

async function updateCollectionOrder(positions) {
    if (!state.activeCollection) return;

    try {
        const response = await fetch(`/collections/${state.activeCollection}/positions`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positions })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update positions');
        }
    } catch (error) {
        console.error('Error updating collection order:', error);
        // Reload images to restore correct order.
        await loadImages();
    }
}

elements.dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-highlight');
});

elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    elements.dropZone.classList.add('dragover');
});

elements.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
    elements.dropZone.classList.remove('drag-highlight');
});

elements.dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.dropZone.classList.remove('dragover');
    elements.dropZone.classList.remove('drag-highlight');

    try {
        const dataStr = e.dataTransfer.getData('application/json');
        if (dataStr) {
            const data = JSON.parse(dataStr);
            if (data.type === 'internal' && data.path) {
                logger.info('Processing internal drag for image search:', data.path);
                await performSearch('image', null, data.path);
                return;
            }
        }

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            await handleImageUpload(file);
        }
    } catch (error) {
        logger.error('Error handling drop:', error);
    } finally {
        state.isDragging = false;
        state.dragIntent = null;
    }
});

elements.dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    elements.dropZone.classList.remove('dragover');
    elements.dropZone.classList.remove('drag-highlight');

    try {
        // Check for internal drag.
        const internalData = e.dataTransfer.getData('application/json');
        if (internalData) {
            const data = JSON.parse(internalData);
            if (data.type === 'internal' && data.path &&
                (!state.activeCollection || state.dragIntent === 'search')) {
                logger.info('Processing internal drag for image search:', data.path);
                await performSearch('image', null, data.path);
                return;
            }
        }

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            await handleImageUpload(file);
        }
    } catch (error) {
        logger.error('Error handling drop:', error);
    }
});

elements.searchBar.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    debouncedSearch(query);
});

elements.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        await handleImageUpload(file);
    }
});

elements.dropZone.addEventListener('click', () => {
    elements.fileInput.click();
});

window.addEventListener('dragoperationend', () => {
    state.isDragging = false;
    state.dragIntent = null;
});

window.addEventListener('scroll', async () => {
    if (state.isLoading || !state.hasMore || state.isSearching) return;
    // Check if we're near the bottom of the page.
    const scrollPosition = window.scrollY + window.innerHeight;
    const bottomThreshold = document.documentElement.scrollHeight - 100;
    if (scrollPosition >= bottomThreshold) {
        state.currentPage++;
        await loadImages(state.currentPage, true);
    }
});

function updateProcessingStatus(status) {
    if (status.is_processing) {
        elements.processingStatus.style.display = 'block';
        elements.processingStatus.textContent =
            `Processing: ${status.processed_count}/${status.total_count}`;
    } else {
        elements.processingStatus.style.display = 'none';
    }
}

async function pollProcessingStatus() {
    try {
        const response = await fetch('/processing-status');
        const status = await response.json();
        updateProcessingStatus(status);
        if (status.is_processing) {
            setTimeout(pollProcessingStatus, 2000);
        }
    } catch (error) {
        logger.error('Error polling status:', error);
    }
}

window.addEventListener('load', () => {
    initializeCollectionsSidebar();
    loadImages();
    pollProcessingStatus();
});

window.addEventListener('DOMContentLoaded', () => {
  const savedWidth = localStorage.getItem('preferredGridWidth');
  if (savedWidth) {
    state.gridWidth = parseInt(savedWidth);
    elements.gridWidth.value = savedWidth;
  }
  initializeCollectionsSidebar();
  updateGridLayout();
  loadImages();
  pollProcessingStatus();
});
