# Публикация от вашего имени

Сборка и Git-коммиты не требуют аккаунта ChatGPT. В GitHub Contributors попадает авторство Git-коммитов. В проекте нет `Co-authored-by`, отдельного AI-автора или bot-аккаунта.

Проверьте локальное авторство перед публикацией:

```sh
cd ~/projects/chat-atlas
git log -1 --format='%an <%ae>%n%cn <%ce>%n%B'
```

Email автора должен быть добавлен и подтверждён в вашем GitHub-аккаунте, чтобы GitHub связал коммит с вами. При необходимости укажите свой подтверждённый email (или GitHub noreply email из Settings → Emails), затем исправьте ещё не опубликованный коммит:

```sh
git config user.name "Ваше имя"
git config user.email "Ваш подтверждённый email"
git commit --amend --reset-author --no-edit
```

## GitHub CLI

Если `gh` ещё не установлен, установите [GitHub CLI](https://cli.github.com/). Авторизуйтесь в своём аккаунте:

```sh
gh auth login
gh auth status
```

Создайте репозиторий и отправьте подготовленный коммит:

```sh
cd ~/projects/chat-atlas
gh repo create chat-atlas --public --source=. --remote=origin --push
```

Для приватного репозитория замените `--public` на `--private`. CLI использует аккаунт, в котором вы авторизовались; команда не добавляет других contributors.

Команда сверена с [официальной документацией gh repo create](https://cli.github.com/manual/gh_repo_create). Привязка авторства описана в [документации GitHub про email коммитов](https://docs.github.com/en/account-and-profile/how-tos/email-preferences/setting-your-commit-email-address).

## Без GitHub CLI

Создайте пустой репозиторий `chat-atlas` в своём GitHub-аккаунте, без автоматически созданных README/license. Скопируйте его URL и выполните:

```sh
cd ~/projects/chat-atlas
git remote add origin https://github.com/YOUR_USERNAME/chat-atlas.git
git push -u origin main
```

Замените `YOUR_USERNAME` на ваш GitHub username. Для HTTPS используйте штатную авторизацию GitHub/credential manager; не помещайте токен в URL, исходники или историю команд.

## Что отправляется

Публикуются исходники, тесты, документация, MIT-лицензия и автономная сборка `dist/index.html`. Синтетическое демо не содержит реальную переписку. Экспорты, личные отчёты и QA-артефакты не входят в коммит.

После публикации пользователи могут скачать `dist/index.html` через кнопку Raw/Download и открыть локально. GitHub Pages или иной хостинг для работы не требуются.
