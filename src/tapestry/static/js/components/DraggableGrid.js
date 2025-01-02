const DraggableGrid = ({ images: initialImages, onImageClick, onOrderUpdate }) => {
    const [images, setImages] = React.useState(initialImages);
    const [currentGridWidth, setCurrentGridWidth] = React.useState(4);
    const [draggedIndex, setDraggedIndex] = React.useState(null);

    React.useEffect(() => {
        setImages(initialImages);
    }, [initialImages]);

    // Handle grid width changes...
    React.useEffect(() => {
        const updateGridWidth = () => {
            // Use the same state.gridWidth as the main grid.
            setCurrentGridWidth(state.gridWidth || 4);
        };

        // Initial setup.
        updateGridWidth();

        // Listen for changes.
        window.addEventListener('gridWidthChange', updateGridWidth);
        return () => window.removeEventListener('gridWidthChange', updateGridWidth);
    }, []);

    const getImageUrl = (image) => {
        if (image.url) return image.url;
        const filename = image.path || image.filename;
        return filename.includes('/uploads/') ? filename : `/images/${filename}`;
    };

    const handleDragStart = (e, index) => {
        setDraggedIndex(index);
        e.target.classList.add('dragging');
    };

    const handleDragEnd = (e) => {
        e.target.classList.remove('dragging');
        setDraggedIndex(null);
    };

    const handleDragOver = (e, index) => {
        e.preventDefault();
        if (draggedIndex === null) return;
        if (index === draggedIndex) return;

        const newImages = [...images];
        const draggedItem = newImages[draggedIndex];
        // Remove dragged item from array and insert at new position.
        newImages.splice(draggedIndex, 1);
        newImages.splice(index, 0, draggedItem);

        // Update local state immediately.
        setImages(newImages);
        setDraggedIndex(index);

        // Update positions in parent.
        const positions = newImages.map((item, idx) => ({
            path: item.path || item.filename,
            position: idx
        }));

        // Call the update handler.
        onOrderUpdate?.(positions);
    };

    return React.createElement('div', {
        className: 'collection-grid w-full',
        style: {
            display: 'grid',
            gridTemplateColumns: `repeat(${currentGridWidth}, minmax(200px, 1fr))`,
            gap: '2%',
            marginTop: '20px'
        }
    },
        images.map((image, index) =>
            React.createElement('div', {
                key: image.path || image.filename || index,
                className: 'image-item relative aspect-square overflow-hidden rounded-lg shadow-md bg-gray-900 cursor-move transition-transform hover:scale-105',
                draggable: true,
                onClick: () => onImageClick(index),
                onDragStart: (e) => handleDragStart(e, index),
                onDragEnd: handleDragEnd,
                onDragOver: (e) => handleDragOver(e, index)
            },
            React.createElement('img', {
                src: getImageUrl(image),
                alt: image.path || image.filename,
                className: 'w-full h-full object-cover'
            })
        ))
    );
};

// Debug wrapper.
const WrappedDraggableGrid = (props) => {
    console.log('DraggableGrid rendering with props:', props);
    const element = React.createElement(DraggableGrid, props);
    console.log('DraggableGrid element:', element);
    return element;
};

window.DraggableGrid = WrappedDraggableGrid;
