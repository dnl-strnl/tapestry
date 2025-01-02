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

function updateGridLayout() {
    const width = state.gridWidth;
    // Calculate percentage width per item.
    const minWidth = Math.floor(100 / width);
    // Update the grid styles.
    elements.imageGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(${width}, minmax(0, 1fr));
        gap: 10px;
        margin-top: 20px;
    `;
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
        div.addEventListener('click', () => {
            showImagePreview(index);
        });

        // Add drag event listeners.
        div.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const dragData = {
                type: 'internal',
                filename: result.filename,
                url: result.url,
                path: result.filename
            };
            e.dataTransfer.setData('application/json', JSON.stringify(dragData));
            div.classList.add('dragging');
            state.isDragging = true;
        });

        div.addEventListener('dragend', (e) => {
            e.stopPropagation();
            div.classList.remove('dragging');
            state.isDragging = false;
        });

        const img = document.createElement('img');
        img.src = result.url;  // Use the processed URL from our data.
        img.alt = result.filename;
        img.loading = 'lazy';

        img.onerror = () => {
            logger.error(`Failed to load image: ${result.filename} from URL: ${img.src}`);
            if (!img.src.includes('/uploads/')) {
                img.src = `/uploads/${result.filename}`;
            } else if (!img.src.includes('/images/')) {
                img.src = `/images/${result.filename}`;
            } else {
                div.innerHTML = `<p>Failed to load: ${result.filename}</p>`;
            }
        };

        div.appendChild(img);
        elements.imageGrid.appendChild(div);
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
            elements.imageGrid.innerHTML = '';
            state.allImageData = [];
        }

        let processedImages;
        if (state.activeCollection) {
            // Handle collection response format.
            processedImages = (data.images || []).map(img => ({
                path: img.path,
                filename: img.path,
                position: img.position,
                url: img.path.includes('/uploads/') ? img.path : `/images/${img.path}`
            }));

            // Use displayCollectionResults for collections
            state.allImageData = processedImages;
            displayCollectionResults(processedImages);
        } else {
            // Handle regular image grid format.
            processedImages = (data.images || []).map(img => ({
                filename: img.filename || img.path || img,
                url: img.url || `/images/${img.filename || img.path || img}`,
                prompt: img.prompt || img.filename,
                ...img
            }));

            // Use displayResults for non-collection views
            if (append) {
                state.allImageData = [...state.allImageData, ...processedImages];
            } else {
                state.allImageData = processedImages;
            }
            displayResults(processedImages, append);
        }

        state.hasMore = data.has_more;
        if (data.processing_status) {
            updateProcessingStatus(data.processing_status);
        }

    } catch (error) {
        logger.error('Error loading images:', error);
        elements.imageGrid.innerHTML = '<p>Error loading images</p>';
    } finally {
        state.isLoading = false;
        elements.loadingIndicator.style.display = 'none';
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

async function handleCollectionSelect(collectionId) {
    state.activeCollection = collectionId;
    state.currentPage = 1;
    state.isSearching = false;
    state.isDragging = false;
    state.dragIntent = null;
    await loadImages();
    updateDraggableState();
}

function initializeCollectionsSidebar() {
  console.log('Initializing collections sidebar...');

  const sidebarElement = document.getElementById('collectionsSidebar');
  if (!sidebarElement) {
    console.error('Collections sidebar element not found!');
    return;
  }

  try {
    console.log('Creating React root...');
    const root = ReactDOM.createRoot(sidebarElement);
    console.log('Rendering CollectionsSidebar component...');
    root.render(React.createElement(window.CollectionsSidebar, {
      onCollectionSelect: handleCollectionSelect,
      activeCollection: state.activeCollection || null
    }));
    console.log('Collections sidebar rendered successfully');
  } catch (error) {
    console.error('Error rendering collections sidebar:', error);
  }
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

async function updateCollectionOrder(positions) {
    if (!state.activeCollection) return;

    console.log('Updating collection order with positions:', positions);  // Debug log

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

        // Log success
        console.log('Successfully updated collection order');
    } catch (error) {
        console.error('Error updating collection order:', error);
        // Reload images to restore correct order
        await loadImages();
    }
}

function displayCollectionResults(results) {
    const container = elements.imageGrid;
    container.innerHTML = '';

    // Create grid container
    const gridContainer = document.createElement('div');
    gridContainer.id = 'draggableGridContainer';
    container.appendChild(gridContainer);

    try {
        const root = ReactDOM.createRoot(gridContainer);
        root.render(React.createElement(window.DraggableGrid, {
            images: results,
            onImageClick: (index) => showImagePreview(index),
            onOrderUpdate: async (positions) => {
                try {
                    await updateCollectionOrder(positions);
                } catch (error) {
                    console.error('Error updating collection order:', error);
                    await loadImages();
                }
            }
        }));
    } catch (error) {
        console.error('Error rendering draggable grid:', error);
        container.innerHTML = '<p>Error displaying images</p>';
    }
}

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

elements.dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (!state.activeCollection || state.dragIntent === 'search') {
        elements.dropZone.classList.add('drag-highlight');
    }
});

elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!state.activeCollection || state.dragIntent === 'search') {
        elements.dropZone.classList.add('dragover');
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

elements.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('dragover');
    elements.dropZone.classList.remove('drag-highlight');
});

elements.gridWidth.addEventListener('change', (e) => {
    const newWidth = parseInt(e.target.value);
    if (newWidth >= 1 && newWidth <= 20) {
        state.gridWidth = newWidth;
        localStorage.setItem('preferredGridWidth', newWidth);
        window.dispatchEvent(new CustomEvent('gridWidthChange'));
        updateGridLayout();
    } else {
        e.target.value = state.gridWidth;
    }
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
