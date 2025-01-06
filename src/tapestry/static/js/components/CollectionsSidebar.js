const CollectionsSidebar = ({ onCollectionSelect, activeCollection }) => {
    const [collections, setCollections] = React.useState([]);
    const [isCreating, setIsCreating] = React.useState(false);
    const [newCollectionName, setNewCollectionName] = React.useState('');
    const [dragOverId, setDragOverId] = React.useState(null);
    const [editingId, setEditingId] = React.useState(null);
    const [editName, setEditName] = React.useState('');
    const [menuOpenId, setMenuOpenId] = React.useState(null);
    const [isCollapsed, setIsCollapsed] = React.useState(false);

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

    const deleteCollection = async (id) => {
        try {
            const response = await fetch(`/collections/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                if (activeCollection === id) {
                    onCollectionSelect?.(null);
                }
                await fetchCollections();
                setMenuOpenId(null);
            }
        } catch (error) {
            console.error('Error deleting collection:', error);
        }
    };

    const renameCollection = async (id) => {
        if (!editName.trim()) return;

        try {
            const response = await fetch(`/collections/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            });

            if (response.ok) {
                await fetchCollections();
                setEditingId(null);
                setEditName('');
                setMenuOpenId(null);
            }
        } catch (error) {
            console.error('Error renaming collection:', error);
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
        sidebarWrapper: {
            position: 'relative',
            height: '100%',
            transition: 'all 0.3s ease',
            width: isCollapsed ? '48px' : '345px',
            backgroundColor: '#1e1e1e',
            overflow: 'hidden',
            borderRight: '1px solid #333',
        },
        sidebar: {
            width: '300px',
            height: '100%',
            backgroundColor: '#1e1e1e',
            padding: '20px',
            color: 'white',
            transform: isCollapsed ? 'translateX(-252px)' : 'translateX(0)',
            transition: 'transform 0.3s ease',
            display: 'flex',
            flexDirection: 'column',
        },
        collapseButtonWrapper: {
            position: 'absolute',
            right: '-16px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1000,
            padding: '8px 0',
            background: 'linear-gradient(to right, #1e1e1e, #262626)',
            borderRadius: '0 8px 8px 0',
            border: '1px solid #333',
            borderLeft: 'none',
        },
        collapseButton: {
            width: '24px',
            height: '40px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#aaa',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            transition: 'all 0.2s ease',
            outline: 'none',
            '&:hover': {
                color: '#fff',
            },
        },

        collapseIcon: {
            transform: isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.3s ease',
            fontSize: '14px',
        },
        header: {
            display: isCollapsed ? 'none' : 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            width: '100%',
        },
        title: {
            fontSize: '18px',
            fontWeight: 'bold',
            opacity: isCollapsed ? 0 : 1,
            transition: 'opacity 0.2s ease',
        },
        createButton: {
            backgroundColor: 'transparent',
            border: 'none',
            padding: '0',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            fontSize: '20px',
            lineHeight: '1',
            color: 'white',
            outline: 'none',
            transition: 'transform 0.2s ease',
            opacity: isCollapsed ? 0 : 1,
        },
        menuButton: {
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
            display: isCollapsed ? 'none' : 'flex',
            alignItems: 'center',
            fontSize: '16px',
            marginLeft: '8px',
            outline: 'none',
            opacity: isCollapsed ? 0 : 1,
            transition: 'opacity 0.2s ease',
        },
        collectionItem: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            marginBottom: '4px',
            borderRadius: '4px',
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            width: '100%',
            transition: 'all 0.2s ease',
            opacity: isCollapsed ? 0 : 1,
        },
        menuPopup: {
            position: 'absolute',
            right: '40px',
            backgroundColor: '#333',
            borderRadius: '4px',
            padding: '4px',
            display: isCollapsed ? 'none' : 'flex',
            flexDirection: 'column',
            gap: '4px',
            zIndex: 1000,
            minWidth: '120px',
            opacity: isCollapsed ? 0 : 1,
            transition: 'opacity 0.2s ease',
        },
        menuItem: {
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            padding: '8px 12px',
            cursor: 'pointer',
            textAlign: 'left',
            borderRadius: '2px',
            width: '100%',
            '&:hover': {
                backgroundColor: '#444',
            },
        },
    };

    return React.createElement('div', { style: styles.sidebarWrapper },
        React.createElement('div', { style: styles.collapseButtonWrapper },
            React.createElement('button', {
                style: styles.collapseButton,
                onClick: () => setIsCollapsed(!isCollapsed),
                onMouseEnter: (e) => e.currentTarget.style.color = '#fff',
                onMouseLeave: (e) => e.currentTarget.style.color = '#666',
            },
                React.createElement('span', { style: styles.collapseIcon },
                    isCollapsed ? '›' : '‹'
                )
            )
        ),

        React.createElement('div', { style: styles.sidebar },
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
                React.createElement('div', {
                    key: collection.id,
                    style: {
                        position: 'relative',
                        backgroundColor: activeCollection === collection.id ? '#2196F3' : 'transparent',
                        ...(dragOverId === collection.id ? styles.dragOver : {}),
                        borderRadius: '4px',
                        marginBottom: '4px'
                    }
                },
                    editingId === collection.id ?
                        React.createElement('div', { style: styles.createForm },
                            React.createElement('input', {
                                type: 'text',
                                value: editName,
                                onChange: (e) => setEditName(e.target.value),
                                placeholder: 'Collection name',
                                style: styles.input,
                                onKeyDown: (e) => {
                                    if (e.key === 'Enter') renameCollection(collection.id);
                                    if (e.key === 'Escape') {
                                        setEditingId(null);
                                        setEditName('');
                                    }
                                }
                            }),
                            React.createElement('div', { style: styles.formButtons },
                                React.createElement('button', {
                                    onClick: () => renameCollection(collection.id),
                                    style: { ...styles.button, backgroundColor: '#2196F3', color: 'white' }
                                }, 'Save'),
                                React.createElement('button', {
                                    onClick: () => {
                                        setEditingId(null);
                                        setEditName('');
                                    },
                                    style: { ...styles.button, backgroundColor: '#333' }
                                }, 'Cancel')
                            )
                        ) :
                        React.createElement('div', {
                            style: styles.collectionItem,
                            onClick: () => onCollectionSelect?.(collection.id),
                            onDragOver: (e) => {
                                e.preventDefault();
                                setDragOverId(collection.id);
                            },
                            onDragLeave: () => setDragOverId(null),
                            onDrop: (e) => handleDrop(e, collection.id),
                        },
                            collection.name,
                            React.createElement('button', {
                                onClick: (e) => {
                                    e.stopPropagation();
                                    setMenuOpenId(menuOpenId === collection.id ? null : collection.id);
                                },
                                style: styles.menuButton
                            }, '⋮'),
                            menuOpenId === collection.id && React.createElement('div', { style: styles.menuPopup },
                                React.createElement('button', {
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        setEditingId(collection.id);
                                        setEditName(collection.name);
                                    },
                                    style: styles.menuItem
                                }, '✏️ Rename'),
                                React.createElement('button', {
                                    onClick: (e) => {
                                        e.stopPropagation();
                                        deleteCollection(collection.id);
                                    },
                                    style: styles.menuItem
                                }, '🗑️ Delete'),
                                React.createElement('button', {
                                    onClick: async (e) => {
                                        e.stopPropagation();
                                        try {
                                            const response = await fetch(`/collections/${collection.id}/export`);
                                            if (response.ok) {
                                                const blob = await response.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `${collection.name}.zip`;
                                                document.body.appendChild(a);
                                                a.click();
                                                window.URL.revokeObjectURL(url);
                                                document.body.removeChild(a);
                                            }
                                        } catch (error) {
                                            console.error('Error exporting collection:', error);
                                        }
                                    },
                                    style: styles.menuItem
                                }, '📤 Export')
                            )
                        )
                )
            )
        )
    );
};

window.CollectionsSidebar = CollectionsSidebar;
