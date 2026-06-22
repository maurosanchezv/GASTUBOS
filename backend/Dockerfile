# gastubos/backend/Dockerfile
FROM node:20-alpine

# Instalar dependencias necesarias para Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci

# Copiar esquema de Prisma y generar cliente
COPY prisma ./prisma/
RUN npx prisma generate

# Copiar el resto del código fuente
COPY . .

# Exponer el puerto
EXPOSE 3001

# Comando por defecto para iniciar la aplicación en producción
CMD ["npm", "run", "start"]
