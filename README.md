# Portal Católico da Fé

Site simples e dinamico para publicar noticias, fotos, videos e informacoes sobre o catolicismo, sem banco de dados.

## Rodar localmente

```bash
npm install
npm start
```

Acesse `http://localhost:3000`.

## Painel administrativo

Acesse `http://localhost:3000/admin`.

Usuario padrao local: `admin`

Senha padrao local: `portal123`

No Render, configure as variaveis de ambiente:

- `ADMIN_PASSWORD`: senha do painel
- `ADMIN_USER`: usuario do painel
- `COOKIE_SECRET`: texto secreto grande para proteger o login

Ao criar uma noticia, informe os links das fotos no campo "Links das fotos", com um link por linha. O campo e opcional e aceita uma ou varias imagens.

## Deploy no Render

1. Crie um novo Web Service no Render.
2. Conecte este repositorio.
3. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Configure as variaveis `ADMIN_PASSWORD` e `COOKIE_SECRET`.

## Observacao importante

O site nao usa banco de dados. As publicacoes ficam em `data/content.json`.

Em hospedagens como Render, arquivos alterados pelo painel podem ser perdidos em reinicios ou novos deploys, porque o disco do servico pode ser temporario. Para manter tudo permanente sem banco, edite o conteudo localmente e envie o repositorio novamente, ou use um disco persistente do Render.
