import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

dotenv.config();

// Kiểm tra nếu VERCEL_URL không có 'https://', thêm vào
const getFullServerUrl = (url) => {
  if (!url) return 'http://localhost:5000'; // Mặc định cho local
  return url.startsWith('http') ? url : `https://${url}`;
};

// Lấy server URL từ biến môi trường
const fullServerUrl = process.env.NODE_ENV === 'production'
  ? getFullServerUrl(process.env.VERCEL_URL || process.env.CLIENT_URL)
  : getFullServerUrl(process.env.CLIENT_URL);

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Academic Content Management API',
      version: '1.0.0',
      description: 'API for managing academic content and author requests',
      contact: {
        name: 'API Support',
        email: 'bknguyen06062003@gmail.com',
      },
    },
    servers: [
      {
        url: fullServerUrl,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      },
      {
        url: 'http://localhost:5000/api',
        description: 'Local API (dành cho dev)'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: ['./routes/*.js', './controllers/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};

export default setupSwagger;