---
name: develop-main-pr
description: aituber-kitでdevelopからmainへ向けるリリース用プルリクエストを作成・更新する。過去のdevelop=>main PR形式を参考に、PR本文を新機能/改善/バグ修正/テスト/ドキュメント・翻訳/その他の日本語セクションで作成し、CodeRabbit自動生成ブロックは含めない。developからmainへのPR作成、リリースPR作成、Develop => main PR作成時に使用。
user-invocable: true
---

# develop => main PR作成スキル

aituber-kitで `develop` から `main` へ向けるリリース用PRを作成・更新する。

## 基本方針

- PRタイトルは原則 `Develop => main`。
- PR本文は過去の `develop => main` PRと同じ日本語リリースノート形式にする。
- 本文は実際の差分から作る。思い込みで機能を増やさない。
- CodeRabbitの自動生成ブロック・自動コメント・レビュー本文はPR本文に含めない。
- 既に `develop -> main` のopen PRがある場合は、新規作成せず本文更新を検討する。

## 手順

1. 現在の状態を確認する。

```bash
git status --short --branch
git fetch origin main develop --prune
gh pr list --state open --base main --head develop --json number,title,url,body
```

2. 過去の `develop => main` PR本文を確認する。

```bash
gh pr list --state merged --base main --head develop --limit 5 --json number,title,body,mergedAt,url
```

3. 今回の差分を確認する。

```bash
git log --oneline --no-merges origin/main..origin/develop
git diff --stat origin/main..origin/develop
git diff --name-only origin/main..origin/develop
```

4. PR本文を作る。

使う見出しは、該当するものだけでよい。

```markdown
## 新機能

- ...

## 改善

- ...

## バグ修正

- ...

## テスト

- ...

## ドキュメント・翻訳

- ...

## その他

- ...
```

5. CodeRabbitブロックを除外する。

PR本文を既存本文から更新する場合は、次のマーカー以降を削除する。

```text
<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
```

6. PRを作成または更新する。

新規作成:

```bash
gh pr create --base main --head develop --title "Develop => main" --body-file /tmp/develop-main-pr-body.md
```

既存PR更新:

```bash
gh pr edit <pr-number> --body-file /tmp/develop-main-pr-body.md
```

7. 作成後に確認する。

```bash
gh pr view <pr-number> --json number,url,title,baseRefName,headRefName,body,mergeStateStatus
gh pr checks <pr-number> --watch=false
```

## 注意

- フッターのリリースバージョン更新、PRマージ、タグ作成、GitHub Release発行はこのスキルでは行わない。`develop-main-release` を使う。
- PR本文に「CodeRabbitの指摘」などボット由来の文言を残すと、Release転記時に混ざるため避ける。
