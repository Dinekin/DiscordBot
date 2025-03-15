FROM node:23-alpine

# Utworzenie katalogu aplikacji
WORKDIR /usr/src/app

# Kopiowanie plików package.json i package-lock.json
COPY package*.json ./

# Instalacja zależności
RUN npm install

# Kopiowanie pozostałych plików projektu
COPY . .

# Tworzenie katalogu na logi
RUN mkdir -p logs

# Zdefiniowanie zmiennych środowiskowych
ENV NODE_ENV=production

# Ujawnienie portu używanego przez serwer web
EXPOSE 3000

# Uruchomienie aplikacji
CMD ["node", "index.js"]