# Discord Reaction Roles Bot with Nginx

This repository contains a Discord bot with a web dashboard, containerized with Docker and served through Nginx as a reverse proxy.

## Architecture

The application consists of three main components:

1. **Discord Bot + Web Dashboard**: Node.js application that runs the Discord bot and serves the web dashboard
2. **MongoDB**: Database for storing bot configuration and data
3. **Nginx**: Reverse proxy for routing requests to the web dashboard

## Prerequisites

- Docker
- Docker Compose
- Discord Bot credentials (token, client ID, client secret)

## Setup Instructions

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Run the setup script to create necessary directories and configuration files:
   ```bash
   chmod +x setup.sh
   ./setup.sh
   ```

3. Edit the `.env` file with your Discord bot credentials and other configuration:
   ```bash
   nano .env
   ```

4. Build the Docker images:
   ```bash
   docker-compose build
   ```

5. Start the containers:
   ```bash
   docker-compose up -d
   ```

6. Access the web dashboard at `http://localhost`

## Configuration

### Environment Variables

Configure the following environment variables in your `.env` file:

- **Discord Bot**:
  - `DISCORD_TOKEN`: Your Discord bot token
  - `CLIENT_ID`: Your Discord application client ID
  - `CLIENT_SECRET`: Your Discord application client secret

- **MongoDB**:
  - `MONGODB_URI`: Connection URI for MongoDB
  - `MONGO_INITDB_ROOT_USERNAME`: MongoDB root username
  - `MONGO_INITDB_ROOT_PASSWORD`: MongoDB root password

- **Web Server**:
  - `WEB_PORT`: Port for the web server (default: 3000)
  - `SESSION_SECRET`: Secret for session management
  - `DASHBOARD_URL`: URL for the dashboard
  - `CALLBACK_URL`: OAuth2 callback URL

### Custom Domain

To use a custom domain:

1. Update the `server_name` directive in `nginx/nginx.conf`
2. Update the `DASHBOARD_URL` and `CALLBACK_URL` in the `.env` file
3. Add SSL certificates if needed

## SSL/HTTPS Configuration

To enable HTTPS:

1. Add SSL certificates to the `nginx/certs` directory
2. Update the Nginx configuration:
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl;
       server_name yourdomain.com;

       ssl_certificate /etc/nginx/certs/yourdomain.com.crt;
       ssl_certificate_key /etc/nginx/certs/yourdomain.com.key;

       # Rest of the configuration...
   }
   ```

## Maintenance

### View Logs

To view logs:
```bash
# Discord bot logs
docker-compose logs discord-bot

# Nginx logs
docker-compose logs nginx

# MongoDB logs
docker-compose logs mongodb
```

### Update the Bot

To update the bot:
```bash
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

### Backup MongoDB Data

The MongoDB data is stored in a Docker volume. To backup:
```bash
docker-compose exec mongodb mongodump --out=/data/db/backup
```

## Troubleshooting

- **Web dashboard not accessible**: Check Nginx logs
- **Discord bot not connecting**: Check Discord bot logs and verify the token
- **Database connection issues**: Verify MongoDB connection string and credentials