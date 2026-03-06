# 🎯 VLinked

Plataforma global de negócios baseada em vídeo.

## 📋 Requisitos

- Node.js 20+
- Docker & Docker Compose
- npm ou yarn

## 🚀 Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/vlinked.git
cd vlinked
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

### 3. Inicie os serviços de infraestrutura

```bash
docker-compose up -d
```

Isso iniciará:
- PostgreSQL 16 na porta 5432
- Redis 7 na porta 6379

### 4. Instale as dependências

```bash
cd apps/api
npm install
```

### 5. Execute as migrations

```bash
npx prisma migrate dev
npx prisma generate
```

### 6. Inicie a aplicação

```bash
npm run start:dev
```

A API estará disponível em `http://localhost:3000`

Documentação Swagger: `http://localhost:3000/api-docs`

## 🏗 Estrutura do Projeto

```
vlinked/
├── apps/
│   ├── api/           # Backend NestJS
│   └── web/           # Frontend React (futuro)
├── docker-compose.yml # Infraestrutura local
└── README.md
```

## 🧪 Testes

```bash
# Testes unitários
npm run test

# Testes e2e
npm run test:e2e

# Cobertura
npm run test:cov
```

## 📚 Documentação

- [API Documentation](http://localhost:3000/api-docs)
- [Prisma Studio](http://localhost:5555) - `npx prisma studio`

## 🛠 Comandos Úteis

```bash
# Reset do banco de dados
npx prisma migrate reset

# Visualizar banco
npx prisma studio

# Logs dos containers
docker-compose logs -f postgres
docker-compose logs -f redis

# Parar serviços
docker-compose down

# Parar e remover volumes
docker-compose down -v
```

## 📝 Licença

[MIT](LICENSE)
