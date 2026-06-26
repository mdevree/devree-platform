# Deployment

Pushes naar `main` bouwen en pushen automatisch een Docker image naar GHCR met tags
`latest` en de korte commit-SHA.

Als de GitHub Actions secret `DEVREE_DEPLOY_SSH_KEY` bestaat, werkt de workflow
ook automatisch productie bij:

1. Pull `ghcr.io/mdevree/devree-platform:<korte-sha>` op de server.
2. Update `/home/DeVreeMakelaardij/stacks/devree-platform/docker-compose.yml`.
3. Herstart alleen de `devree-platform` service.
4. Check `http://127.0.0.1:3100/digitale-medewerker`.
5. Rol terug naar de vorige tag als de healthcheck faalt.

Het server-script staat op:

```bash
/usr/local/sbin/deploy-devree-platform <korte-sha>
```

De server logt deploys naar:

```bash
/home/DeVreeMakelaardij/logs/devree-platform-deploy.log
```

De GitHub Actions key is server-side beperkt tot alleen dit deploycommando. De
private key staat lokaal in `.deploy/github-actions-devree-platform` en mag niet
worden gecommit.
