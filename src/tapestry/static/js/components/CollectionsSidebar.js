const CollectionsSidebar = ({ onCollectionSelect, activeCollection }) => {
    const [collections, setCollections] = React.useState([]);
    const [isCreating, setIsCreating] = React.useState(false);
    const [newCollectionName, setNewCollectionName] = React.useState('');
    const [dragOverId, setDragOverId] = React.useState(null);

    React.useEffect(() => {
        fetchCollections();
    }, []);

    const fetchCollections = async () => {
        try {
            const response = await fetch('/collections');
            const data = await response.json();
            if (data.collections) {
                setCollections(data.collections);
            }
        } catch (error) {
            console.error('Error fetching collections:', error);
        }
    };

    const createCollection = async () => {
        if (!newCollectionName.trim()) return;

        try {
            const response = await fetch('/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newCollectionName })
            });

            if (response.ok) {
                await fetchCollections();
                setNewCollectionName('');
                setIsCreating(false);
            }
        } catch (error) {
            console.error('Error creating collection:', error);
        }
    };

    const handleDrop = async (e, collectionId) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(null);

        try {
            const dataStr = e.dataTransfer.getData('application/json');
            const data = JSON.parse(dataStr);

            if (data.type === 'internal' && data.path) {
                const response = await fetch(`/collections/${collectionId}/images`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        image_paths: [data.path]
                    })
                });

                if (!response.ok) {
                    throw new Error('Failed to add image to collection');
                }

                if (activeCollection === collectionId) {
                    onCollectionSelect(collectionId);
                }
            }
        } catch (error) {
            console.error('Error handling image drop:', error);
        } finally {
            const dragEndEvent = new CustomEvent('dragoperationend');
            window.dispatchEvent(dragEndEvent);
        }
    };

    const styles = {
        sidebar: {
            width: '250px',
            height: '100%',
            backgroundColor: '#1e1e1e',
            padding: '20px',
            color: 'white'
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
        },
        title: {
            fontSize: '18px',
            fontWeight: 'bold'
        },
        createButton: {
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            padding: '8px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            fontSize: '20px',
            lineHeight: '1'
        },
        createForm: {
            marginBottom: '20px'
        },
        input: {
            width: '100%',
            padding: '8px',
            marginBottom: '8px',
            backgroundColor: '#333',
            border: '1px solid #444',
            color: 'white',
            borderRadius: '4px'
        },
        formButtons: {
            display: 'flex',
            gap: '8px'
        },
        button: {
            padding: '8px 12px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        },
        collectionItem: {
            padding: '8px',
            marginBottom: '4px',
            cursor: 'pointer',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            width: '100%',
            textAlign: 'left',
            transition: 'all 0.2s ease'
        },
        dragOver: {
            backgroundColor: '#2196F3',
            opacity: '0.5'
        }
    };

    return React.createElement('div', { style: styles.sidebar },
        React.createElement('div', { style: styles.header },
            React.createElement('span', { style: styles.title }, 'Collections'),
            React.createElement('button', {
                style: styles.createButton,
                onClick: () => setIsCreating(true)
            }, '+')
        ),

        isCreating && React.createElement('div', { style: styles.createForm },
            React.createElement('input', {
                type: 'text',
                value: newCollectionName,
                onChange: (e) => setNewCollectionName(e.target.value),
                placeholder: 'Collection name',
                style: styles.input,
                onKeyDown: (e) => {
                    if (e.key === 'Enter') createCollection();
                    if (e.key === 'Escape') setIsCreating(false);
                }
            }),
            React.createElement('div', { style: styles.formButtons },
                React.createElement('button', {
                    onClick: createCollection,
                    style: { ...styles.button, backgroundColor: '#2196F3', color: 'white' }
                }, 'Create'),
                React.createElement('button', {
                    onClick: () => setIsCreating(false),
                    style: { ...styles.button, backgroundColor: '#333' }
                }, 'Cancel')
            )
        ),

        React.createElement('button', {
            onClick: () => onCollectionSelect?.(null),
            style: {
                ...styles.collectionItem,
                backgroundColor: !activeCollection ? '#2196F3' : 'transparent'
            }
        }, '📁'),

        collections.map((collection) =>
            React.createElement('button', {
                key: collection.id,
                onClick: () => onCollectionSelect?.(collection.id),
                onDragOver: (e) => {
                    e.preventDefault();
                    setDragOverId(collection.id);
                },
                onDragLeave: () => setDragOverId(null),
                onDrop: (e) => handleDrop(e, collection.id),
                style: {
                    ...styles.collectionItem,
                    backgroundColor: activeCollection === collection.id ? '#2196F3' : 'transparent',
                    ...(dragOverId === collection.id ? styles.dragOver : {})
                }
            }, collection.name)
        )
    );
};

window.CollectionsSidebar = CollectionsSidebar;
