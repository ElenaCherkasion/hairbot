// src/services/ai-service.js
import OpenAI from 'openai';
import logger from '../utils/logger.js';

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async analyzeFace(imageUrl) {
    try {
      logger.info(`Анализ лица: ${imageUrl.substring(0, 50)}...`);
      
      // Имитация анализа для теста
      return {
        faceShape: 'овальное',
        recommendations: 'Стрижки с объемом на макушке, асимметричные стрижки',
        confidence: 0.85
      };
      
      // Реальный вызов OpenAI (раскомментировать когда будет ключ)
      /*
      const response = await this.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Проанализируй форму лица на этом фото и дай рекомендации по стрижкам" },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 1000
      });
      
      return response.choices[0].message.content;
      */
      
    } catch (error) {
      logger.error(`Ошибка анализа лица: ${error.message}`);
      throw error;
    }
  }
}

export default new AIService();
