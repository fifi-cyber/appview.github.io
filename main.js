// Variables globales
let currentCard;
let categories = new Set();
let currentFilter = 'all';
let isSignedIn = false;

// Elementos del DOM
const addButton = document.getElementById('addButton');
const urlInput = document.getElementById('urlInput');
const nameInput = document.getElementById('nameInput');
const categorySelect = document.getElementById('categorySelect');
const cardContainer = document.getElementById('cardContainer');
const groupContainer = document.getElementById('groupContainer');
const categoryContainer = document.getElementById('categoryContainer');
const editModal = document.getElementById('editModal');
const editUrlInput = document.getElementById('editUrlInput');
const editNameInput = document.getElementById('editNameInput');
const editDescriptionInput = document.getElementById('editDescriptionInput');
const logoUpload = document.getElementById('logoUpload');
const saveEditButton = document.getElementById('saveEditButton');
const closeModalButton = document.getElementById('closeModalButton');
const searchInput = document.getElementById('searchInput');

// Funciones
function hideCover() {
    document.getElementById('cover').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}

async function loadCards() {
    let cards;
    if (isSignedIn) {
        cards = await loadFromCloud();
    } else {
        cards = JSON.parse(localStorage.getItem('cards')) || [];
    }
    cardContainer.innerHTML = ''; // Limpiar el contenedor antes de cargar
    cards.forEach(card => {
        addCard(card.url, card.name, card.category, card.logo, card.description);
        categories.add(card.category);
    });
    updateCategoryTags();
}

async function saveCards() {
    const cards = Array.from(cardContainer.children).map(cardToObject);
    localStorage.setItem('cards', JSON.stringify(cards));
    if (isSignedIn) {
        await syncToCloud(cards);
    }
}

function updateCategoryTags() {
    categoryContainer.innerHTML = '<span class="category-tag active" onclick="filterCards(\'all\')">Todas</span>';
    categories.forEach(category => {
        const tag = document.createElement('span');
        tag.className = 'category-tag';
        tag.textContent = category;
        tag.addEventListener('click', () => filterCards(category));
        categoryContainer.appendChild(tag);
    });
}

function filterCards(category) {
    currentFilter = category;
    const cards = cardContainer.children;
    const searchTerm = searchInput.value.toLowerCase();
    Array.from(cards).forEach(card => {
        const cardCategory = card.querySelector('.category-label').textContent;
        const cardName = card.querySelector('.font-medium').textContent.toLowerCase();
        const cardUrl = card.querySelector('a').href.toLowerCase();
        const cardDescription = card.dataset.description.toLowerCase();
        const matchesSearch = cardName.includes(searchTerm) || cardUrl.includes(searchTerm) || cardDescription.includes(searchTerm);
        card.style.display = (category === 'all' || cardCategory === category) && matchesSearch ? '' : 'none';
    });
}

function addCard(url, name, category, logo = '', description = '') {
    const card = document.createElement('div');
    card.className = 'card';
    const initials = name.split(' ').map(word => word[0]).join('').toUpperCase();
    const uiAvatarsUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff`;
    
    // Obtener el favicon de la URL
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`;
    
    card.innerHTML = `
        <img src="${faviconUrl}" alt="${name}" class="card-logo" onerror="this.onerror=null; this.src='${logo || uiAvatarsUrl}'">
        <div class="card-content">
            <a href="${url}" target="_blank" class="font-medium">${name}</a>
            <p class="category-label">${category}</p>
        </div>
        <div class="card-buttons">
            <button onclick="editCard(this.parentNode.parentNode)">Editar</button>
            <button onclick="deleteCard(this.parentNode.parentNode)">Eliminar</button>
        </div>
        <button class="preview-button" onclick="togglePreview(this.parentNode)">i</button>
        <div class="preview-tooltip">
            <span class="preview-tooltip-text">${description}</span>
        </div>
    `;
    card.dataset.description = description;
    cardContainer.appendChild(card);
    categories.add(category);
    updateCategoryTags();
    saveCards();
}

function editCard(card) {
    currentCard = card;
    const link = card.querySelector('a');
    editUrlInput.value = link.href;
    editNameInput.value = link.textContent;
    editDescriptionInput.value = card.dataset.description;
    editModal.classList.remove('hidden');
    editModal.classList.add('flex');
}

function deleteCard(card) {
    card.remove();
    saveCards();
    updateCategoryTags();
}

function togglePreview(card) {
    const tooltip = card.querySelector('.preview-tooltip');
    const allTooltips = document.querySelectorAll('.preview-tooltip');
    
    // Ocultar todas las demás previsualizaciones
    allTooltips.forEach(t => {
        if (t !== tooltip) {
            t.style.display = 'none';
            t.style.opacity = '0';
        }
    });

    if (tooltip.style.display === 'none' || tooltip.style.display === '') {
        tooltip.style.display = 'block';
        setTimeout(() => {
            tooltip.style.opacity = '1';
        }, 10);
    } else {
        tooltip.style.opacity = '0';
        setTimeout(() => {
            tooltip.style.display = 'none';
        }, 300);
    }
}

// Funciones de autenticación y sincronización
function onSignIn(googleUser) {
    isSignedIn = true;
    document.getElementById('googleSignInButton').style.display = 'none';
    document.getElementById('signOutButton').style.display = 'block';
    loadCards(); // Cargar tarjetas desde la nube después de iniciar sesión
    showNotification('Sesión iniciada correctamente', 'success');
}

function signOut() {
    const auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(function () {
        console.log('User signed out.');
        isSignedIn = false;
        document.getElementById('googleSignInButton').style.display = 'block';
        document.getElementById('signOutButton').style.display = 'none';
        loadCards(); // Cargar tarjetas desde localStorage después de cerrar sesión
        showNotification('Sesión cerrada', 'info');
    });
}

async function syncToCloud(cards) {
    if (!isSignedIn) {
        console.error('No se ha iniciado sesión');
        showNotification('Error: Inicia sesión para sincronizar', 'error');
        return;
    }

    const accessToken = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
    const fileName = 'appview_cards.json';
    const fileContent = JSON.stringify(cards);

    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${fileName}'`,
            fields: 'files(id, name)'
        });

        let fileId;
        if (response.result.files.length > 0) {
            fileId = response.result.files[0].id;
            await gapi.client.request({
                path: `/upload/drive/v3/files/${fileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: fileContent
            });
        } else {
            await gapi.client.drive.files.create({
                resource: { name: fileName },
                media: {
                    mimeType: 'application/json',
                    body: fileContent
                },
                fields: 'id'
            });
        }

        console.log('Datos sincronizados con éxito');
        showNotification('Sincronización completada', 'success');
    } catch (error) {
        console.error('Error al sincronizar con Google Drive:', error);
        showNotification('Error al sincronizar. Intenta de nuevo.', 'error');
    }
}

async function loadFromCloud() {
    if (!isSignedIn) {
        console.error('No se ha iniciado sesión');
        return [];
    }

    const accessToken = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
    const fileName = 'appview_cards.json';

    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${fileName}'`,
            fields: 'files(id, name)'
        });

        if (response.result.files.length > 0) {
            const fileId = response.result.files[0].id;
            const fileResponse = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            return JSON.parse(fileResponse.body);
        } else {
            console.log('No se encontró el archivo en Google Drive');
            return [];
        }
    } catch (error) {
        console.error('Error al cargar desde Google Drive:', error);
        showNotification('Error al cargar datos. Usando datos locales.', 'error');
        return [];
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }, 100);
}

function cardToObject(card) {
    return {
        url: card.querySelector('a').href,
        name: card.querySelector('.font-medium').textContent,
        category: card.querySelector('.category-label').textContent,
        logo: card.querySelector('img').src,
        description: card.dataset.description
    };
}

// Event Listeners
addButton.addEventListener('click', () => {
    const url = urlInput.value;
    const name = nameInput.value;
    const category = categorySelect.value;
    if (url && name) {
        addCard(url, name, category);
        urlInput.value = '';
        nameInput.value = '';
    }
});

saveEditButton.addEventListener('click', () => {
    const link = currentCard.querySelector('a');
    const newUrl = editUrlInput.value;
    link.href = newUrl;
    link.textContent = editNameInput.value;
    currentCard.dataset.description = editDescriptionInput.value;
    currentCard.querySelector('.preview-tooltip-text').textContent = editDescriptionInput.value;
    
    // Actualizar el favicon
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(newUrl).hostname}&sz=64`;
    currentCard.querySelector('.card-logo').src = faviconUrl;
    
    if (logoUpload.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            currentCard.querySelector('.card-logo').src = e.target.result;
            saveCards();
        };
        reader.readAsDataURL(logoUpload.files[0]);
    } else {
        saveCards();
    }
    
    editModal.classList.add('hidden');
    editModal.classList.remove('flex');
});

closeModalButton.addEventListener('click', () => {
    editModal.classList.add('hidden');
    editModal.classList.remove('flex');
});

searchInput.addEventListener('input', () => filterCards(currentFilter));

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    loadCards();

    // Implementación de arrastre y agrupación de tarjetas
    new Sortable(cardContainer, {
        animation: 150,
        ghostClass: 'bg-blue-100',
        onEnd: saveCards
    });

    new Sortable(groupContainer, {
        animation: 150,
        ghostClass: 'bg-blue-100',
        group: 'shared',
        onAdd: function (evt) {
            const item = evt.item;
            if (evt.to === groupContainer) {
                const newGroup = document.createElement('div');
                newGroup.className = 'group-container';
                newGroup.innerHTML = '<h3 class="group-title">Nuevo Grupo</h3>';
                groupContainer.appendChild(newGroup);
                newGroup.appendChild(item);
                new Sortable(newGroup, {
                    animation: 150,
                    ghostClass: 'bg-blue-100',
                    group: 'shared'
                });
            }
            saveCards();
        }
    });

    // Inicializar la API de Google
    gapi.load('client:auth2', () => {
        gapi.client.init({
            apiKey: 'TU_API_KEY',
            clientId: 'TU_ID_DE_CLIENTE_DE_GOOGLE.apps.googleusercontent.com',
            discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"],
            scope: 'https://www.googleapis.com/auth/drive.file'
        }).then(() => {
            // Escucha los cambios en el estado de inicio de sesión
            gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
            // Maneja el estado inicial de inicio de sesión
            updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        });
    });
});

function updateSigninStatus(isSignedIn) {
    if (isSignedIn) {
        onSignIn(gapi.auth2.getAuthInstance().currentUser.get());
    } else {
        signOut();
    }
}