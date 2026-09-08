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
- `CLOUDINARY_CLOUD_NAME`: nome do ambiente no Cloudinary
- `CLOUDINARY_API_KEY`: chave da API do Cloudinary
- `CLOUDINARY_API_SECRET`: segredo da API, somente no servidor

Ao criar uma noticia, escreva o texto e escolha uma foto JPG, PNG, WEBP ou GIF do celular ou computador (ate 5 MB). Tambem e possivel usar um link publico de imagem como alternativa.

## Deploy no Render

1. Crie um novo Web Service no Render.
2. Conecte este repositorio.
3. Use:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Configure as variaveis listadas acima, incluindo as tres do Cloudinary. Mantenha a mesma `DATABASE_URL` do Neon.

## Banco de dados Neon

Na primeira inicializacao, o servidor cria automaticamente as tabelas definidas em `database/schema.sql` e importa o conteudo inicial de `data/content.json`. Depois disso, noticias, fotos, videos e informacoes do site sao persistidos no Neon.

No desenvolvimento local, carregue o `.env` com `node --env-file=.env server.js` ou exporte as variaveis no terminal. O arquivo `.env` esta ignorado pelo Git e nunca deve ser enviado ao repositorio.

Os novos uploads do painel sao enviados em memoria para o Cloudinary (JPG, PNG, WEBP ou GIF, ate 5 MB). Apenas a URL HTTPS retornada e gravada em `news_images.url` no Neon. Nenhum novo upload e salvo no disco do Render. Sem configuracao do Cloudinary, uploads exibem erro; noticias antigas e edicoes somente de texto continuam funcionando.

Em **Conteudos publicados → Noticias → Editar**, altere titulo, categoria e texto. Uma nova foto ou link substitui as fotos atuais. Sem uma nova foto, as imagens atuais sao preservadas, exceto as marcadas para remocao. A data original e mantida.

Ao remover/substituir imagens ou excluir noticias, o sistema salva primeiro no Neon e depois exclui do Cloudinary os arquivos da pasta `portal-da-fe/news` que nao estejam mais referenciados em noticias ou na galeria. Links externos nao sao apagados. Em falhas de exclusao, o painel informa que e necessario verificar os arquivos sem uso no Cloudinary. Se o banco falhar depois de um upload, o sistema tenta limpar o arquivo enviado. Falhas de rede podem exigir limpeza manual de arquivos orfaos.

### Fotos anteriores ao Cloudinary

Links externos e caminhos `/uploads/...` existentes continuam sendo exibidos e sao mantidos ao editar somente o texto. Isso nao torna persistente o disco antigo: **antes de um novo deploy**, copie os arquivos ainda existentes em `public/uploads` do Render. Envie cada foto antiga novamente pela edicao da respectiva noticia para obter uma URL Cloudinary; confira a imagem no site antes de descartar o backup. Fotos ja perdidas no disco temporario precisam ser reenviadas a partir do original. Nao ha migracao automatica nem exclusao dos arquivos locais antigos.

Nunca inclua credenciais no codigo ou no Git. Configure-as no ambiente do Render ou no `.env` local.

Testes locais (sem credenciais reais): `node --test`.
