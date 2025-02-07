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
  draggedIndex: null,
  totalImages: 0,
  imagesPerPage: 100,
  currentDataset: null,
  activeCollection: null
};

// DOM Elements.
const elements = {
  searchBar: document.querySelector('.search-bar'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  imageGrid: document.getElementById('imageGrid'),
  gridWidth: document.getElementById('gridWidth'),
  collectionsSidebar: document.getElementById('collectionsSidebar'),
  loadingIndicator: document.getElementById('loadingIndicator'),
  processingStatus: document.getElementById('processingStatus')
};

elements.datasetSelector = document.getElementById('datasetSelector');

function initializeDatasetSelector() {
    if (!elements.datasetSelector) {
        console.error('Dataset selector container not found!');
        return;
    }
    createDatasetSelector();
    fetchAndPopulateDatasets();
}

function createDatasetSelector() {
    elements.datasetSelector.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'search-container';

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'search-controls';

    const select = document.createElement('select');
    select.className = 'search-bar';
    select.id = 'datasetSelect';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a dataset...';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    controlsDiv.appendChild(select);
    container.appendChild(controlsDiv);
    elements.datasetSelector.appendChild(container);

    select.addEventListener('change', async (e) => {
        console.log("Dataset changed to:", e.target.value);
        await handleDatasetChange(e.target.value);
    });

    return select;
}

async function fetchAndPopulateDatasets() {
    try {
        const response = await fetch('/api/datasets');
        const data = await response.json();
        console.log("Fetched datasets:", data);

        const select = document.getElementById('datasetSelect');
        if (!select) {
            console.error("Dataset select element not found.");
            return;
        }

        // Clear existing options except default.
        while (select.options.length > 1) {
            select.remove(1);
        }

        if (!data.datasets || data.datasets.length === 0) {
            console.log("No datasets found.");
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No datasets found.';
            option.disabled = true;
            select.appendChild(option);
            return;
        }

        data.datasets.forEach(dataset => {
            const option = document.createElement('option');
            option.value = dataset.id;
            option.textContent = dataset.name;
            select.appendChild(option);
        });

        // Select first dataset by default.
        if (data.datasets.length > 0) {
            const firstDataset = data.datasets[0];
            select.value = firstDataset.id;
            state.currentDataset = firstDataset.id;
            handleDatasetChange(firstDataset.id);
        }
    } catch (error) {
        console.error('Error fetching datasets:', error);
        const errorMessage = document.createElement('p');
        errorMessage.className = 'search-status';
        errorMessage.textContent = 'Error loading datasets';
        elements.datasetSelector.appendChild(errorMessage);
    }
}

async function handleDatasetChange(datasetId) {
    console.log("Handling dataset change:", datasetId);
    if (!datasetId) {
        console.log("No dataset ID provided");
        return;
    }

    state.currentDataset = datasetId;
    resetPagination();
    await loadImages();
}

async function handleCollectionSelect(collectionId) {
    resetPagination();
    state.activeCollection = collectionId;
    state.isSearching = false;
    state.isDragging = false;
    state.dragIntent = null;
    await loadImages();
}

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

function resetPagination() {
    state.currentPage = 1;
    state.hasMore = true;
    state.allImageData = [];
    state.totalImages = 0;
}

function getImageUrl(image) {
    return window.utils.getImageUrl(image, state.currentDataset);
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

    newImages.splice(state.draggedIndex, 1);
    newImages.splice(index, 0, draggedItem);

    state.allImageData = newImages;
    state.draggedIndex = index;

    displayResults(newImages);

    const positions = newImages.map((item, idx) => ({
        path: item.path || item.filename,
        position: idx
    }));

    try {
        await updateCollectionOrder(positions);
    } catch (error) {
        console.error('Error updating collection order:', error);
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

        const globalIndex = append ? state.allImageData.length - results.length + index : index;

        const img = document.createElement('img');
        img.src = getImageUrl(result);
        img.alt = result.filename || result.path;
        img.loading = 'lazy';
        img.className = 'w-full h-full object-cover';

        if (state.activeCollection) {
            div.addEventListener('dragstart', (e) => {
                handleDragStart(e, index);
                const imageData = {
                    type: 'internal',
                    path: result.path || result.filename,
                    sourceCollectionId: state.activeCollection,
                    dataset_id: state.currentDataset
                };
                e.dataTransfer.setData('application/json', JSON.stringify(imageData));
                e.dataTransfer.effectAllowed = 'copyMove';
            });
            div.addEventListener('dragend', handleDragEnd);
            div.addEventListener('dragover', (e) => handleDragOver(e, index));
        } else {
            div.addEventListener('dragstart', (e) => {
                state.isDragging = true;
                state.dragIntent = null;
                const imageData = {
                    type: 'internal',
                    path: result.path || result.filename,
                    dataset_id: state.currentDataset
                };
                e.dataTransfer.setData(
                    'application/json',
                    JSON.stringify(imageData)
                );
                e.dataTransfer.effectAllowed = 'copy';
            });
        }

        div.appendChild(img);
        elements.imageGrid.appendChild(div);
        div.addEventListener('click', () => showImagePreview(globalIndex));
    });
}

async function loadImages(page = 1, append = false) {
    if (state.isLoading || (!append && state.isSearching) || !state.currentDataset) return;

    state.isLoading = true;
    elements.loadingIndicator.style.display = 'block';

    try {
        let url = state.activeCollection
            ? `/collections/${state.activeCollection}`
            : `/get-all-images?dataset_id=${state.currentDataset}&page=${page}&per_page=${state.imagesPerPage}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!append) {
            state.allImageData = [];
            state.totalImages = data.total;
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

        state.hasMore = state.allImageData.length < state.totalImages;

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

    sidebarElement.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (state.isDragging) {
            state.dragIntent = 'collection';
            sidebarElement.classList.add('drag-highlight');
        }
    });

    sidebarElement.addEventListener('dragleave', (e) => {
        e.preventDefault();
        if (state.isDragging) {
            state.dragIntent = null;
            sidebarElement.classList.remove('drag-highlight');
        }
    });

    sidebarElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (state.isDragging) {
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    sidebarElement.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        sidebarElement.classList.remove('drag-highlight');

        try {
            const jsonData = e.dataTransfer.getData('application/json');
            if (!jsonData) {
                logger.error('No JSON data found in drop event.');
                return;
            }

            const data = JSON.parse(jsonData);
            if (data.type === 'internal' && data.path) {
                await addImageToCollection(data.path);
                logger.info('Successfully added image to collection:', data.path);
            }
        } catch (error) {
            logger.error('Error handling collection drop:', error);
        } finally {
            state.isDragging = false;
            state.dragIntent = null;
            sidebarElement.classList.remove('drag-highlight');
        }
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
    if (state.isLoading || !state.currentDataset) return;

    resetPagination();
    state.isLoading = true;
    state.isSearching = true;
    elements.loadingIndicator.style.display = 'block';

    try {
        const response = await fetch('/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dataset_id: state.currentDataset,
                type,
                query,
                image,
                limit: state.imagesPerPage,
                page: state.currentPage
            })
        });

        const data = await response.json();
        if (!data || data.error) {
            throw new Error(data.error || 'Search failed');
        }

        state.totalImages = data.total || 0;
        state.allImageData = data.results || [];
        state.hasMore = state.allImageData.length < state.totalImages;

        displayResults(data.results || [], false);

    } catch (error) {
        logger.error('Search error:', error);
        elements.imageGrid.innerHTML = '<p class="error-message">Search failed.</p>';
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
        const modalElement = React.createElement(
              window.ImagePreviewModal, {
              images: state.allImageData,
              initialIndex: index,
              collectionId: state.activeCollection,
              onImageRemoved: () => {
                  loadImages();
              },
              onClose: () => {
                  root.unmount();
                  previewContainer.remove();
            }
        });
        root.render(modalElement);
        logger.info('Modal rendered successfully with index:', index);
    } catch (error) {
        logger.error('Error rendering preview modal:', error);
    }
}

async function handleImageUpload(file) {
    if (!state.currentDataset) {
        alert('Select a dataset.');
        return;
    }

    elements.loadingIndicator.style.display = 'block';

    try {
        logger.info('Uploading image:', file.name);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('dataset_id', state.currentDataset);

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
            throw new Error('Failed to add image to collection.');
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
        await loadImages();
    }
}

elements.dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (state.isDragging) {
        state.dragIntent = 'search';
    }
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

window.addEventListener('dragend', () => {
    state.isDragging = false;
    state.dragIntent = null;
    document.querySelectorAll('.drag-highlight').forEach(el => {
        el.classList.remove('drag-highlight');
    });
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
                // Clear drag state before processing.
                const currentDragIntent = state.dragIntent;
                state.isDragging = false;
                state.dragIntent = null;

                if (currentDragIntent === 'collection' && state.activeCollection) {
                    logger.info('Adding image to collection:', data.path);
                    await addImageToCollection(data.path);
                } else {
                    logger.info('Processing image search:', data.path);
                    await performSearch('image', null, data.path);
                }
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
    if (!state.currentDataset) return;

    try {
        const response = await fetch(`/processing-status?dataset_id=${state.currentDataset}`);
        if (!response.ok) {
            throw new Error('Failed to fetch processing status.');
        }

        const status = await response.json();
        updateProcessingStatus(status);

        if (status.is_processing) {
            setTimeout(pollProcessingStatus, 2000);
        }
    } catch (error) {
        console.error('Error polling status:', error);
    }
}

let scrollTimeout = null;
window.addEventListener('scroll', () => {
    if (scrollTimeout) return;

    scrollTimeout = setTimeout(async () => {
        if (state.isLoading || !state.hasMore || state.isSearching) {
            scrollTimeout = null;
            return;
        }
        const scrollPosition = window.scrollY + window.innerHeight;
        const bottomThreshold = document.documentElement.scrollHeight - 300;
        if (scrollPosition >= bottomThreshold) {
            state.currentPage++;
            await loadImages(state.currentPage, true);
        }
        scrollTimeout = null;
    }, 150);
});

window.addEventListener('dragoperationend', () => {
    state.isDragging = false;
    state.dragIntent = null;
});

window.addEventListener('load', () => {
    initializeCollectionsSidebar();
    loadImages();
    pollProcessingStatus();
});

window.state = state;

window.addEventListener('DOMContentLoaded', () => {

  const savedWidth = localStorage.getItem('preferredGridWidth');
  if (savedWidth) {
    state.gridWidth = parseInt(savedWidth);
    elements.gridWidth.value = savedWidth;
  }
  createDatasetSelector();
  fetchAndPopulateDatasets();
  initializeCollectionsSidebar();
  updateGridLayout();
  loadImages();
  pollProcessingStatus();
});
