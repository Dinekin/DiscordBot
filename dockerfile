FROM node:18-alpine

# Dodaj etykiety do obrazu
LABEL maintainer="Discord Bot Maintainer"
LABEL description="Discord Reaction Roles Bot with Web Dashboard"
LABEL version="1.0.5"

# Użycie argumentu NODE_ENV z możliwością nadpisania
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Utworzenie katalogu aplikacji
WORKDIR /usr/src/app

# Kopiowanie plików package.json i package-lock.json
COPY package*.json ./

# Zainstalowanie narzędzi do budowy (dla natywnych modułów) i zależności
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --only=production \
    && apk del .build-deps

# Kopiowanie reszty kodu aplikacji
COPY . .

# Tworzenie katalogu na logi
RUN mkdir -p logs && chmod -R 777 logs

# Ujawnienie portu używanego przez serwer web
EXPOSE 3000

# Ustawienie nieroot użytkownika z odpowiednimi uprawnieniami
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /usr/src/app
USER appuser

# Ustawienie punktu wejścia
CMD ["node", "index.js"]