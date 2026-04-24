const videoUpload = document.getElementById('video-upload');
const fpsSlider = document.getElementById('fps-slider');
const fpsValue = document.getElementById('fps-value');
const widthInput = document.getElementById('width-input');
const heightInput = document.getElementById('height-input');
const convertBtn = document.getElementById('convert-btn');
const statusText = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');
const progressContainer = document.getElementById('progress-container');
const resultContainer = document.getElementById('result');
const outputGif = document.getElementById('output-gif');
const downloadBtn = document.getElementById('download-btn');

// Лайтбокс элементы
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightbox-img');
const closeLightbox = document.getElementById('close-lightbox');

const presetBtns = document.querySelectorAll('.preset-btn');

// Функция для синхронизации ползунка, текста и кнопок
function updateFPS(value) {
    fpsSlider.value = value;
    fpsValue.textContent = value;
    
    // Убираем класс active у всех кнопок и добавляем той, что совпадает по значению
    presetBtns.forEach(btn => {
        if (btn.dataset.fps === value.toString()) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Вешаем события на кнопки пресетов
presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        updateFPS(btn.dataset.fps);
    });
});

// Обновляем слушатель ползунка, чтобы он тоже переключал кнопки
fpsSlider.addEventListener('input', (e) => {
    updateFPS(e.target.value);
});

// Вызываем один раз при загрузке, чтобы подсветить дефолтные 15 FPS
updateFPS(fpsSlider.value);


const sizeBtns = document.querySelectorAll('.size-btn');

// Функция для обновления полей размера
function updateSizePreset(width) {
    widthInput.value = width;
    heightInput.value = ''; // При выборе пресета всегда ставим высоту в "Авто"
    
    // Подсветка активной кнопки
    sizeBtns.forEach(btn => {
        if (btn.dataset.width === width.toString()) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Вешаем события на кнопки размеров
sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        updateSizePreset(btn.dataset.width);
    });
});

// Если пользователь начал вводить ширину вручную — снимаем подсветку с кнопок
widthInput.addEventListener('input', () => {
    sizeBtns.forEach(btn => btn.classList.remove('active'));
});

// Инициализация: подсветим кнопку 480 при загрузке
updateSizePreset(widthInput.value);

// Настройка FFmpeg
const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({ 
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
});

// Обновление значения FPS в интерфейсе
fpsSlider.addEventListener('input', (e) => {
    fpsValue.textContent = e.target.value;
});

// Инициализация
(async function loadFFmpeg() {
    convertBtn.disabled = true;
    try {
        await ffmpeg.load();
        statusText.textContent = "Загрузите видео.";
        convertBtn.disabled = false;
    } catch (error) {
        statusText.textContent = "Ошибка загрузки. Обновите страницу";
        console.error(error);
    }
})();

ffmpeg.setProgress(({ ratio }) => {
    const percent = Math.round(ratio * 100);
    if (percent >= 0 && percent <= 100) {
        progressBar.style.width = percent + '%';
        statusText.textContent = `Конвертация: ${percent}%`;
    }
});

convertBtn.addEventListener('click', async () => {
    const files = videoUpload.files;
    if (files.length === 0) return alert('Пожалуйста, выберите видео файл!');

    const file = files[0];
    
    // Защита от огромных файлов (> 30 МБ)
    if (file.size > 30 * 1024 * 1024) {
        return alert(`Файл слишком большой! Выберите видео до 30 МБ.`);
    }

    const fps = fpsSlider.value;
    let w = widthInput.value ? widthInput.value : '-1';
    let h = heightInput.value ? heightInput.value : '-1';
    if (w === '-1' && h === '-1') w = '480';

    convertBtn.disabled = true;
    resultContainer.style.display = 'none';
    progressContainer.style.display = 'block';

    try {
        // 1. Загружаем видео в память браузера
        await ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
        
        let isSuccess = false;

        // --- ГЛАВНЫЙ БЛОК: Попытка сделать в лучшем качестве ---
        try {
            statusText.textContent = 'Обработка (Высокое качество)...';
            await ffmpeg.run(
                '-i', 'input.mp4', 
                '-vf', `fps=${fps},scale=${w}:${h}:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`, 
                'output.gif'
            );
            isSuccess = true; // Если дошли до сюда, значит получилось!

        } catch (qualityError) {
            // --- ЗАПАСНОЙ ПЛАН: Если высокое качество вызвало нехватку памяти ---
            console.warn("Нехватка памяти для высокого качества. Включаем запасной план.", qualityError);
            statusText.textContent = 'Тяжелый файл. Переключаемся на экономный режим...';
            
            // Запускаем вторую, более легкую команду
            await ffmpeg.run(
                '-i', 'input.mp4', 
                '-vf', `fps=${fps},scale=${w}:${h}:flags=lanczos`, 
                'output.gif'
            );
            isSuccess = true; // Если легкий режим сработал
        }

        // --- ВЫВОД РЕЗУЛЬТАТА ---
        if (isSuccess) {
            const data = ffmpeg.FS('readFile', 'output.gif');
            const gifUrl = URL.createObjectURL(new Blob([data.buffer], { type: 'image/gif' }));
            
            outputGif.src = gifUrl;
            downloadBtn.href = gifUrl;
            resultContainer.style.display = 'block';
            statusText.textContent = 'Успешно завершено!';
        }

    } catch (fatalError) {
        // Сюда мы попадем, только если УПАЛИ ОБА ВАРИАНТА (Совсем критическая нехватка памяти)
        console.error("Критическая ошибка:", fatalError);
        statusText.innerHTML = '<span style="color: red;">Ошибка: Видео слишком тяжелое даже для экономного режима. Уменьшите размер или FPS.</span>';
    } finally {
        // Уборка за собой
        progressContainer.style.display = 'none';
        convertBtn.disabled = false;
        
        // Аккуратно удаляем файлы из памяти, игнорируя ошибки, если файлов нет
        try { ffmpeg.FS('unlink', 'input.mp4'); } catch (e) {}
        try { ffmpeg.FS('unlink', 'output.gif'); } catch (e) {}
    }
});

// Логика лайтбокса
outputGif.addEventListener('click', () => {
    lightboxImg.src = outputGif.src;
    lightbox.style.display = 'flex';
});

closeLightbox.addEventListener('click', () => lightbox.style.display = 'none');
lightbox.addEventListener('click', (e) => { if(e.target === lightbox) lightbox.style.display = 'none'; });
document.addEventListener('keydown', (e) => { if(e.key === 'Escape') lightbox.style.display = 'none'; })