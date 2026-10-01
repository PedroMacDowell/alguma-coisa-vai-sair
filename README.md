# School Register

Sistema escolar em React + Vite no frontend e Node.js + Express no backend.

## O que o sistema faz

- Cadastro de alunos com nome completo, nomes dos familiares, endereco, matricula, data de nascimento e notas gerais
- Lancamento de notas, trabalhos e observacoes por aluno
- Boletim escolar com visual proprio para impressao
- Busca e selecao de alunos
- Dashboard com quantidade de alunos, registros e media geral

## Segurança da matricula

- A matricula e cifrada no backend
- A interface mostra apenas a matricula mascarada
- Os endpoints nunca devolvem a matricula em texto puro

## Estrutura

- `server/`: API Express com persistencia em arquivo e cifragem dos dados sensiveis
- `client/`: interface React + Vite com boletim pronto para imprimir

## Como rodar

1. Instale as dependencias:

```bash
cd server
npm install
cd ../client
npm install
```

2. Inicie o backend:

Antes de iniciar, crie o arquivo `server/.env` a partir de `server/.env.example` e defina login, senha e token:

```bash
cd server
cp .env.example .env   # edite com seus valores
npm run dev
```

3. Inicie o frontend:

```bash
cd client
npm run dev
```

4. Abra:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Impressao do boletim

- Selecione um aluno
- Lance notas ou trabalhos
- Clique em `Imprimir boletim`

O CSS de impressao foi preparado para gerar uma folha limpa, pronta para imprimir no navegador.
