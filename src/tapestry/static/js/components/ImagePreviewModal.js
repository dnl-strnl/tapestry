const ImagePreviewModal = ({ images: initialImages, initialIndex, onClose, collectionId, onImageRemoved }) => {
    const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
    const [images, setImages] = React.useState(initialImages);
    const [clickedButton, setClickedButton] = React.useState(null);

    if (!images || !images[currentIndex]) {
        console.error('Invalid images or index.');
        return null;
    }

    const currentImage = images[currentIndex];

    React.useEffect(() => {
        const handleKeyPress = (e) => {
            if (e.key === 'ArrowLeft') {
                setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1);
            } else if (e.key === 'ArrowRight') {
                setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0);
            } else if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [images.length, onClose]);

    const copyToClipboard = (text, buttonId) => {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Copied to clipboard:', text);
            setClickedButton(buttonId);
            setTimeout(() => setClickedButton(null), 350);
        }).catch((err) => {
            console.error('Failed to copy:', err);
        });
    };

    const handleImageRemoval = async () => {
        try {
            const response = await fetch(`/collections/${collectionId}/images`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_paths: [currentImage.path || currentImage.filename]
                })
            });

            if (response.ok) {
                const newImages = images.filter((_, index) => index !== currentIndex);
                setImages(newImages);
                onImageRemoved?.();

                if (newImages.length === 0) {
                    onClose();
                } else {
                    setCurrentIndex(prev =>
                        prev === images.length - 1 ? prev - 1 : prev
                    );
                }
            } else {
                console.error('Failed to remove image from collection.');
            }
        } catch (error) {
            console.error('Error removing image:', error);
        }
    };

    const containerStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
    };

    const contentStyle = {
        backgroundColor: 'rgb(36, 36, 36)',
        borderRadius: '0.75rem',
        width: '90vw',
        height: '90vh',
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
    };

    const imageContainerStyle = {
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        backgroundColor: 'rgb(29, 29, 29)'
    };

    const imageStyle = {
        maxHeight: '85vh',
        maxWidth: '100%',
        objectFit: 'contain'
    };

    const buttonStyle = {
        position: 'absolute',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        color: 'white',
        border: 'none',
        borderRadius: '50%',
        width: '44px',
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        fontSize: '1.25rem',
        backdropFilter: 'blur(4px)'
    };

    const sidebarStyle = {
        width: '320px',
        backgroundColor: 'rgb(36, 36, 36)',
        padding: '1.75rem',
        borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        overflowY: 'auto'
    };

    const closeButtonStyle = {
        position: 'absolute',
        right: '1.25rem',
        top: '1.25rem',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: 'none',
        color: 'white',
        cursor: 'pointer',
        width: '32px',
        height: '32px',
        borderRadius: '6px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease',
        fontSize: '1.25rem'
    };

    const actionButtonStyle = (buttonId) => ({
        backgroundColor: clickedButton === buttonId ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        padding: '0.5rem 1rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        width: '100%',
        textAlign: 'left',
        marginTop: '0.5rem'
    });

    const detailItemStyle = {
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem'
    };

    const labelStyle = {
        color: 'rgba(255, 255, 255, 0.6)',
        fontSize: '0.875rem',
        fontWeight: 500
    };

    const valueStyle = {
        color: 'white',
        fontSize: '0.9375rem',
        lineHeight: '1.5',
        wordBreak: 'break-word'
    };

    return React.createElement('div', { style: containerStyle },
        React.createElement('div', { style: contentStyle },
            React.createElement('div', { style: imageContainerStyle },
                React.createElement('button', {
                    style: { ...buttonStyle, left: '20px' },
                    onClick: () => setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1)
                }, '←'),
                React.createElement('img', {
                    src: currentImage.url || `/uploads/${currentImage.filename}`,
                    alt: currentImage.filename,
                    style: imageStyle
                }),
                React.createElement('button', {
                    style: { ...buttonStyle, right: '20px' },
                    onClick: () => setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0)
                }, '→')
            ),
            React.createElement('div', { style: sidebarStyle },
                React.createElement('button', {
                    onClick: onClose,
                    style: closeButtonStyle
                }, '×'),
                React.createElement('h2', {
                    style: {
                        color: 'white',
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        marginBottom: '0.5rem'
                    }
                }, 'Image Details'),
                React.createElement('div', { style: detailItemStyle },
                    React.createElement('span', { style: labelStyle }, 'Filename'),
                    React.createElement('span', { style: valueStyle }, currentImage.filename),
                    React.createElement('button', {
                        onClick: () => copyToClipboard(currentImage.filename, 'filename'),
                        style: actionButtonStyle('filename')
                    }, 'Copy Filename')
                ),
                currentImage.prompt && React.createElement('div', { style: detailItemStyle },
                    React.createElement('span', { style: labelStyle }, 'Prompt'),
                    React.createElement('span', { style: valueStyle }, currentImage.prompt),
                    React.createElement('button', {
                        onClick: () => copyToClipboard(currentImage.prompt, 'prompt'),
                        style: actionButtonStyle('prompt')
                    }, 'Copy Prompt')
                ),
                React.createElement('div', {
                    style: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginTop: 'auto',
                        fontSize: '0.875rem',
                        textAlign: 'center'
                    }
                }, [
                    collectionId && React.createElement('button', {
                        onClick: handleImageRemoval,
                        style: {
                            ...actionButtonStyle('remove'),
                            backgroundColor: 'rgba(220, 53, 69, 0.2)',
                            marginBottom: '0.75rem'
                        }
                    }, '🗑️ Remove from Collection'),
                    `Image ${currentIndex + 1} of ${images.length}`
                ])
            )
        )
    );
};

window.ImagePreviewModal = ImagePreviewModal;
