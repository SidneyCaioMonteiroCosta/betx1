# 🚀 Deploy no Fly.io (São Paulo) — Ping baixo no Brasil

O objetivo é colocar o servidor em **São Paulo (região GRU)** para que o
ping dos jogadores brasileiros fique em **20–50ms**, igual ao Free Fire.

> A Railway não tem datacenter no Brasil — por isso o ping ficava em 120–150ms.
> O Fly.io tem a região GRU (São Paulo), e é isso que resolve de vez.

---

## 1. Instalar o Fly CLI (uma vez só)

No PowerShell (Windows):

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Feche e reabra o PowerShell depois de instalar.

## 2. Criar conta e logar

```powershell
fly auth signup   # ou: fly auth login
```

> O Fly pede um cartão de crédito para evitar abuso, mas tem camada gratuita
> generosa. Um app pequeno como esse roda de graça ou por poucos dólares/mês.

## 3. Criar o app (NÃO faça deploy ainda)

Dentro da pasta do projeto:

```powershell
fly launch --no-deploy
```

- Quando perguntar o **nome**, use `superduelo` (ou outro, mas atualize o `app =` no `fly.toml`).
- Quando perguntar a **região**, escolha **gru (São Paulo)**.
- Se perguntar se quer criar Postgres/Redis, responda **NÃO** (vamos manter o banco atual).
- Se ele sobrescrever o `fly.toml`, confira se ficou `primary_region = "gru"`.

## 4. Configurar as variáveis de ambiente (secrets)

O banco de dados continua o **mesmo da Railway** (não precisa migrar — o banco
só é acessado quando uma partida começa/termina, não durante o jogo, então a
localização dele não afeta o ping).

Copie o `DATABASE_URL` que está hoje na Railway e rode:

```powershell
fly secrets set DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/BANCO"
```

Depois configure a URL pública (usada no KYC/Gov.br):

```powershell
fly secrets set PUBLIC_URL="https://superduelo.fly.dev"
```

(Se for usar o Gov.br depois, adicione também:)

```powershell
fly secrets set GOVBR_CLIENT_ID="seu_id" GOVBR_CLIENT_SECRET="seu_secret"
```

## 5. Fazer o deploy 🚀

```powershell
fly deploy
```

Espere terminar. No final ele mostra a URL, algo como `https://superduelo.fly.dev`.

## 6. Testar o ping

Abra o jogo de Air Hockey pela URL do Fly e veja o indicador de ping.
Deve cair para **20–50ms** no Brasil. 🎉

---

## ⚠️ Regras importantes

- **NUNCA rode `fly scale count 2` ou mais.** O estado das partidas fica na
  memória do servidor. Com 2+ máquinas, dois jogadores podem cair em servidores
  diferentes e a partida não inicia. Mantenha **sempre 1 máquina**.
- Se um dia o site crescer muito e precisar de várias máquinas, aí sim a gente
  adiciona um **Redis adapter** no Socket.io para compartilhar estado. Por
  enquanto, 1 máquina em São Paulo aguenta tranquilo centenas de jogadores.

## Domínio próprio (opcional)

Para usar seu domínio (ex: `superduelo.com.br`):

```powershell
fly certs add superduelo.com.br
```

E aponte o DNS conforme as instruções que o comando mostrar.
