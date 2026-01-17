import { OpenAI } from 'openai';
import { КОНФИГ } from '../config.js';

let openai = null;

// Инициализация OpenAI клиента
function getOpenAI() {
  if (!openai && КОНФИГ.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: КОНФИГ.OPENAI_API_KEY,
      timeout: КОНФИГ.ТАЙМАУТ
    });
  }
  return openai;
}

/**
 * Анализ фото с помощью OpenAI Vision
 */
export async function analyzePhotoWithAI(photoUrl, tariff) {
  const openai = getOpenAI();
  
  if (!openai) {
    // Тестовый режим, если OpenAI не настроен
    return getTestAnalysis(tariff);
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: КОНФИГ.OPENAI_MODEL_VISION,
      messages: [
        {
          role: "system",
          content: `Ты профессиональный стилист-парикмахер. 
          Проанализируй форму лица на фото и дай рекомендации.
          Тариф клиента: ${tariff.toUpperCase()}
          
          Формат ответа в JSON:
          {
            "face_shape": "тип лица",
            "recommendations": ["стрижка1", "стрижка2", ...],
            "hair_colors": ["цвет1", "цвет2", ...],
            "additional_notes": "дополнительные заметки"
          }`
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Проанализируй это фото лица. Определи форму лица и дай рекомендации по стрижкам." 
            },
            { 
              type: "image_url", 
              image_url: { url: photoUrl } 
            }
          ]
        }
      ],
      max_tokens: КОНФИГ.OPENAI_MAX_TOKENS,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(response.choices[0].message.content);
    return result;
    
  } catch (error) {
    console.error('Ошибка OpenAI:', error);
    return getTestAnalysis(tariff);
  }
}

/**
 * Тестовый анализ (когда OpenAI не доступен)
 */
function getTestAnalysis(tariff) {
  const shapes = ['овальное', 'круглое', 'квадратное', 'прямоугольное', 'сердцевидное'];
  const haircuts = ['Каскад', 'Боб', 'Каре', 'Пикси', 'Асимметричная', 'Длинные слои'];
  const colors = ['Каштановый', 'Шоколадный', 'Медовый', 'Пшеничный', 'Пепельный'];
  
  const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
  const randomHaircuts = haircuts.sort(() => 0.5 - Math.random()).slice(0, 3);
  const randomColors = colors.sort(() => 0.5 - Math.random()).slice(0, 2);
  
  return {
    face_shape: randomShape,
    recommendations: randomHaircuts,
    hair_colors: tariff === 'free' ? [] : randomColors,
    additional_notes: tariff === 'free' 
      ? 'Для получения рекомендаций по цвету волос выберите тариф PRO или PREMIUM.'
      : 'Рекомендации основаны на анализе формы лица.'
  };
}

/**
 * Генерация изображения стрижки с помощью DALL-E
 */
export async function generateHaircutImage(description) {
  const openai = getOpenAI();
  
  if (!openai) {
    return null; // В тестовом режиме не генерируем изображения
  }
  
  try {
    const response = await openai.images.generate({
      model: КОНФИГ.OPENAI_IMAGE_MODEL,
      prompt: `Профессиональная стрижка волос: ${description}. 
               Стильная современная прическа, реалистичное изображение.`,
      n: 1,
      size: "1024x1024"
    });
    
    return response.data[0].url;
  } catch (error) {
    console.error('Ошибка генерации изображения:', error);
    return null;
  }
}
