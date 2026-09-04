# Portal Católico da Fé

Site simples e dinamico para publicar noticias, fotos, videos e informacoes sobre o catolicismo, com PostgreSQL no Neon.

## Rodar localmente

```bash
npm install
cp .env.example .env
# Preencha DATABASE_URL e as demais variaveis no arquivo .env.
node --env-file=.env server.js
```

Acesse `http://localhost:3000`.

## Painel administrativo

Acesse `http://localhost:3000/admin`.

Usuario padrao local: `admin`

Senha padrao local: `portal123`

No Render, configure as variaveis de ambiente:

- `DATABASE_URL`: string de conexao copiada em **Connect** no painel do Neon
- `ADMIN_PASSWORD`: senha do painel
- `ADMIN_USER`: usuario do painel
- `COOKIE_SECRET`: texto secreto grande para proteger o login

Ao criar uma noticia, escreva o texto e escolha uma foto JPG, PNG, WEBP ou GIF do celular ou computador (ate 5 MB). Tambem e possivel usar um link publico de imagem como alternativa.

## Deploy no Render

1. Crie um novo Web Service no Render.
2. Conecte este repositorio.
3. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Configure as variaveis `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_USER` e `COOKIE_SECRET`.

## Banco de dados Neon

Na primeira inicializacao, o servidor cria automaticamente as tabelas definidas em `database/schema.sql` e importa o conteudo inicial de `data/content.json`. Depois disso, noticias, fotos, videos e informacoes do site sao persistidos no Neon.

No desenvolvimento local, carregue o `.env` com `node --env-file=.env server.js` ou exporte as variaveis no terminal. O arquivo `.env` esta ignorado pelo Git e nunca deve ser enviado ao repositorio.

As imagens enviadas diretamente pelo painel ainda ficam em `public/uploads`. Em hospedagens com disco temporario, prefira links de imagens externas ou configure armazenamento persistente.
