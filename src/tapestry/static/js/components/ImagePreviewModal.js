const ImagePreviewModal = ({ images, initialIndex, onClose }) => {
    const [currentIndex, setCurrentIndex] = React.useState(initialIndex);
    const [clickedButton, setClickedButton] = React.useState(null); // Tracks which button was clicked

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

    const getButtonStyle = (buttonId) => ({
        margin: '0.5rem 0',
        padding: '0.5rem 1rem',
        backgroundColor: clickedButton === buttonId ? 'gray' : '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '0.25rem',
        cursor: 'pointer',
    });

    const containerStyle = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
    };

    const contentStyle = {
        backgroundColor: 'rgb(17, 24, 39)',
        borderRadius: '0.5rem',
        width: '90vw',
        height: '90vh',
        display: 'flex',
        position: 'relative'
    };

    const sidebarStyle = {
        width: '300px',
        backgroundColor: 'rgb(17, 24, 39)',
        padding: '1.5rem',
        borderLeft: '1px solid rgba(255, 255, 255, 0.1)'
    };

    return React.createElement('div', { style: containerStyle },
        React.createElement('div', { style: contentStyle },
            React.createElement('div', {
                style: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }
            },
                React.createElement('button', {
                    style: { position: 'absolute', left: '20px', backgroundColor: 'rgba(0, 0, 0, 0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
                    onClick: () => setCurrentIndex(prev => prev > 0 ? prev - 1 : images.length - 1)
                }, '←'),
                React.createElement('img', {
                    src: currentImage.url || `/uploads/${currentImage.filename}`,
                    alt: currentImage.filename,
                    style: { maxHeight: '80vh', maxWidth: '100%', objectFit: 'contain' }
                }),
                React.createElement('button', {
                    style: { position: 'absolute', right: '20px', backgroundColor: 'rgba(0, 0, 0, 0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
                    onClick: () => setCurrentIndex(prev => prev < images.length - 1 ? prev + 1 : 0)
                }, '→')
            ),
            React.createElement('div', { style: sidebarStyle },
                React.createElement('button', {
                    onClick: onClose,
                    style: { position: 'absolute', right: '1rem', top: '1rem', backgroundColor: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }
                }, '✕'),
                React.createElement('h2', { style: { color: 'white', marginBottom: '1rem' } }, 'Image Details'),
                React.createElement('div', { style: { color: 'white', marginBottom: '1rem' } },
                    React.createElement('p', null, `Filename: ${currentImage.filename}`),
                    React.createElement('button', {
                        onClick: () => copyToClipboard(currentImage.filename, 'filename'),
                        style: getButtonStyle('filename')
                    }, 'Copy Filename'),
                    currentImage.prompt && React.createElement('p', null, `Prompt: ${currentImage.prompt}`),
                    currentImage.prompt && React.createElement('button', {
                        onClick: () => copyToClipboard(currentImage.prompt, 'prompt'),
                        style: getButtonStyle('prompt')
                    }, 'Copy Prompt')
                ),
                React.createElement('p', {
                    style: { color: 'rgba(255, 255, 255, 0.6)', marginTop: '1rem' }
                }, `Image ${currentIndex + 1} of ${images.length}`)
            )
        )
    );
};

window.ImagePreviewModal = ImagePreviewModal;
