# Instagram Organizer Pro

Instagramのダウンロードデータを読み込み、フォロー/フォロワーを整理するReact + Vite製ツールです。

## できること

- フォロワー数 / フォロー中数 / 相互フォロー率
- 自分だけフォローしている人
- 相手だけフォローしてくれている人
- 相互フォロー一覧
- 前回からフォロー解除された人
- 新規フォロワー
- 新しく相互になった人
- 自分がフォロー解除した人
- CSV出力
- 次回比較用スナップショット保存

## Instagram側で用意するファイル

Instagramアプリからデータをダウンロードし、形式はJSONを選んでください。

- followers_1.json
- following.json

## ローカルで動かす

```bash
npm install
npm run dev
```

## ビルド

```bash
npm run build
```

## GitHub Pagesで公開する場合

1. GitHubでリポジトリを作る
2. このフォルダの中身をアップロード
3. GitHub Actionsまたは手動で `npm run build`
4. `dist` をGitHub Pagesに公開

※ まずはローカル動作確認がおすすめです。
