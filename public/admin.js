const newsForm = document.querySelector('.news-form');
const fileInput = document.querySelector('#news-image-file');
const imageData = document.querySelector('#news-image-data');
const preview = document.querySelector('#news-image-preview');
const previewImage = preview?.querySelector('img');
const fileName = document.querySelector('#news-image-name');
const removeButton = document.querySelector('#remove-news-image');
const formError = document.querySelector('#news-form-error');
let selectionVersion = 0;

function clearImage() {
  if (!fileInput) return;
  selectionVersion++;
  fileInput.value = '';
  imageData.value = '';
  previewImage.removeAttribute('src');
  preview.hidden = true;
  fileName.textContent = 'Nenhuma foto escolhida';
  formError.hidden = true;
}

fileInput?.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return clearImage();

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
    clearImage();
    formError.textContent = 'Escolha uma imagem JPG, PNG, WEBP ou GIF com no maximo 5 MB.';
    formError.hidden = false;
    return;
  }

  const version = ++selectionVersion;
  imageData.value = '';
  const reader = new FileReader();
  reader.addEventListener('error', () => {
    if (version !== selectionVersion) return;
    clearImage();
    formError.textContent = 'Nao foi possivel ler a foto. Escolha o arquivo novamente.';
    formError.hidden = false;
  });
  reader.addEventListener('load', () => {
    if (version !== selectionVersion) return;
    imageData.value = reader.result;
    previewImage.src = reader.result;
    preview.hidden = false;
    fileName.textContent = file.name;
    formError.hidden = true;
  });
  reader.readAsDataURL(file);
});

removeButton?.addEventListener('click', clearImage);

newsForm?.addEventListener('submit', (event) => {
  if (fileInput.files.length && !imageData.value) {
    event.preventDefault();
    formError.textContent = 'Aguarde a foto terminar de carregar e tente novamente.';
    formError.hidden = false;
  }
});
