
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Search, Download, Upload, RefreshCw, ExternalLink, Users, UserCheck, UserMinus, UserPlus, HeartHandshake } from "lucide-react";
import "./styles.css";

const TAB_CONFIG = [
  { key: "notFollowingBack", label: "自分だけフォロー", icon: UserMinus, description: "フォローしているけど、フォローバックされていない人" },
  { key: "fans", label: "相手だけフォロー", icon: UserPlus, description: "相手はフォローしてくれているけど、自分はフォローしていない人" },
  { key: "mutual", label: "相互フォロー", icon: HeartHandshake, description: "お互いにフォローしている人" },
  { key: "followers", label: "フォロワー全員", icon: Users, description: "現在のフォロワー一覧" },
  { key: "following", label: "フォロー中全員", icon: UserCheck, description: "現在フォローしている人一覧" },
  { key: "unfollowedMe", label: "前回からフォロー解除された", icon: UserMinus, description: "前回データではフォロワーだったが、今回いなくなった人" },
  { key: "newFollowers", label: "新規フォロワー", icon: UserPlus, description: "前回データにはおらず、今回新しく増えたフォロワー" },
  { key: "newMutual", label: "新しく相互になった", icon: HeartHandshake, description: "前回は相互ではなく、今回相互になった人" },
  { key: "iUnfollowed", label: "自分が解除した", icon: RefreshCw, description: "前回はフォロー中だったが、今回フォロー中から外れた人" }
];

function emptyData() {
  return {
    createdAt: null,
    followers: [],
    following: [],
    mutual: [],
    notFollowingBack: [],
    fans: [],
    unfollowedMe: [],
    newFollowers: [],
    newMutual: [],
    iUnfollowed: []
  };
}

function normalizeUsername(value) {
  if (!value) return "";
  let name = String(value).trim();

  if (name.startsWith("https://www.instagram.com/_u/")) {
    name = name.replace("https://www.instagram.com/_u/", "");
  } else if (name.startsWith("https://www.instagram.com/")) {
    name = name.replace("https://www.instagram.com/", "");
  }

  name = name.replace(/^@/, "").replace(/\/$/, "").trim();

  if (!/^[A-Za-z0-9._]{1,30}$/.test(name)) return "";
  return name;
}

function uniqueSorted(list) {
  return [...new Set(list.map(normalizeUsername).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function extractUsernames(json) {
  const names = [];

  function walk(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (typeof value === "object") {
      // followers_1.json 系：string_list_data[0].value
      if (Array.isArray(value.string_list_data)) {
        value.string_list_data.forEach((item) => {
          if (item?.value) names.push(item.value);
          if (item?.href) names.push(item.href);
        });
      }

      // following.json 系：relationships_following[].title
      if (value.title) names.push(value.title);
      if (value.username) names.push(value.username);
      if (value.value) names.push(value.value);
      if (value.href) names.push(value.href);

      Object.values(value).forEach(walk);
    }
  }

  walk(json);
  return uniqueSorted(names);
}

async function readJson(file) {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file.name} がJSONとして読めません。Instagramのダウンロード形式がJSONか確認してください。`);
  }
}

function compareLists(followers, following, previous) {
  const followersSet = new Set(followers);
  const followingSet = new Set(following);

  const result = emptyData();
  result.createdAt = new Date().toISOString();
  result.followers = followers;
  result.following = following;
  result.mutual = following.filter((name) => followersSet.has(name));
  result.notFollowingBack = following.filter((name) => !followersSet.has(name));
  result.fans = followers.filter((name) => !followingSet.has(name));

  if (previous) {
    const prevFollowersSet = new Set(previous.followers || []);
    const prevFollowingSet = new Set(previous.following || []);
    const prevMutualSet = new Set(previous.mutual || []);

    result.unfollowedMe = [...prevFollowersSet].filter((name) => !followersSet.has(name)).sort();
    result.newFollowers = followers.filter((name) => !prevFollowersSet.has(name));
    result.newMutual = result.mutual.filter((name) => !prevMutualSet.has(name));
    result.iUnfollowed = [...prevFollowingSet].filter((name) => !followingSet.has(name)).sort();
  }

  return result;
}

function downloadText(text, filename, type = "text/plain;charset=utf-8") {
  const blob = new Blob(["\uFEFF" + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function makeCsv(list) {
  return ["username,instagram_url", ...list.map((name) => `${name},https://www.instagram.com/${name}/`)].join("\n");
}

function App() {
  const [followersFiles, setFollowersFiles] = useState([]);
  const [followingFile, setFollowingFile] = useState(null);
  const [previousFile, setPreviousFile] = useState(null);
  const [data, setData] = useState(emptyData());
  const [activeTab, setActiveTab] = useState("notFollowingBack");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const activeConfig = TAB_CONFIG.find((tab) => tab.key === activeTab);
  const activeList = data[activeTab] || [];

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter((name) => name.toLowerCase().includes(q));
  }, [activeList, query]);

  const mutualRate = data.following.length
    ? Math.round((data.mutual.length / data.following.length) * 100)
    : 0;

  async function handleAnalyze() {
    setMessage("");

    if (!followersFiles.length || !followingFile) {
      setMessage("今回のフォロワーJSONとフォロー中JSONを両方選択してください。");
      return;
    }

    setIsBusy(true);
    try {
      let followers = [];
      for (const file of followersFiles) {
        const json = await readJson(file);
        followers = followers.concat(extractUsernames(json));
      }

      const followingJson = await readJson(followingFile);
      const following = extractUsernames(followingJson);

      let previous = null;
      if (previousFile) {
        previous = await readJson(previousFile);
      }

      const result = compareLists(uniqueSorted(followers), uniqueSorted(following), previous);
      setData(result);
      setAnalyzed(true);
      setActiveTab("notFollowingBack");
      setQuery("");

      const warning = result.followers.length === 0 || result.following.length === 0
        ? " ただし件数が0の項目があります。選択ファイルが正しいか確認してください。"
        : "";

      setMessage(previousFile ? `前回データとの比較まで完了しました。${warning}` : `分析完了。次回比較用に「今回データを保存」を押してください。${warning}`);
    } catch (error) {
      setMessage(error.message || "読み込みに失敗しました。");
    } finally {
      setIsBusy(false);
    }
  }

  function saveSnapshot() {
    if (!analyzed) {
      setMessage("先に分析してください。");
      return;
    }

    const snapshot = {
      version: "2.0",
      createdAt: data.createdAt,
      followers: data.followers,
      following: data.following,
      mutual: data.mutual,
      notFollowingBack: data.notFollowingBack,
      fans: data.fans
    };

    downloadText(JSON.stringify(snapshot, null, 2), "instagram_follow_snapshot.json", "application/json;charset=utf-8");
  }

  function saveCurrentCsv() {
    if (!analyzed) {
      setMessage("先に分析してください。");
      return;
    }
    downloadText(makeCsv(filteredList), `${activeTab}.csv`, "text/csv;charset=utf-8");
  }

  function saveAllCsv() {
    if (!analyzed) {
      setMessage("先に分析してください。");
      return;
    }

    const body = TAB_CONFIG.map((tab) => `【${tab.label}】\n${makeCsv(data[tab.key] || [])}`).join("\n\n");
    downloadText(body, "instagram_follow_all_lists.csv", "text/csv;charset=utf-8");
  }

  function resetAll() {
    setFollowersFiles([]);
    setFollowingFile(null);
    setPreviousFile(null);
    setData(emptyData());
    setActiveTab("notFollowingBack");
    setQuery("");
    setMessage("");
    setAnalyzed(false);
    document.querySelectorAll("input[type=file]").forEach((input) => (input.value = ""));
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">No Login / Local Processing</p>
          <h1>Instagram Organizer Pro</h1>
          <p className="lead">
            Instagramのダウンロードデータを読み込んで、相互フォロー・片思い・新規フォロワー・フォロー解除を整理できます。
          </p>
        </div>
        <div className="heroCard">
          <div className="heroNumber">{mutualRate}%</div>
          <div className="heroLabel">相互フォロー率</div>
        </div>
      </header>

      <section className="notice">
        <strong>安全設計：</strong>
        InstagramのID・パスワードは入力しません。データはブラウザ内だけで処理され、外部送信されません。
      </section>

      <section className="uploadGrid">
        <div className="panel">
          <div className="panelTitle"><Upload size={18} /> 今回のフォロワーJSON</div>
          <p>followers_1.json / followers_2.json など。複数選択OK。</p>
          <input
            type="file"
            accept=".json"
            multiple
            onChange={(e) => setFollowersFiles([...e.target.files])}
          />
          <small>{followersFiles.length ? `${followersFiles.length}件選択中` : "未選択"}</small>
        </div>

        <div className="panel">
          <div className="panelTitle"><Upload size={18} /> 今回のフォロー中JSON</div>
          <p>following.json を選択。</p>
          <input
            type="file"
            accept=".json"
            onChange={(e) => setFollowingFile(e.target.files?.[0] || null)}
          />
          <small>{followingFile ? followingFile.name : "未選択"}</small>
        </div>

        <div className="panel">
          <div className="panelTitle"><RefreshCw size={18} /> 前回スナップショット</div>
          <p>前回このツールで保存したJSON。初回は空欄でOK。</p>
          <input
            type="file"
            accept=".json"
            onChange={(e) => setPreviousFile(e.target.files?.[0] || null)}
          />
          <small>{previousFile ? previousFile.name : "未選択"}</small>
        </div>
      </section>

      <section className="actions">
        <button onClick={handleAnalyze} disabled={isBusy}>{isBusy ? "分析中..." : "分析する"}</button>
        <button className="secondary" onClick={saveSnapshot}>今回データを保存</button>
        <button className="ghost" onClick={resetAll}>リセット</button>
      </section>

      {message && <div className={message.includes("失敗") || message.includes("選択") ? "message error" : "message"}>{message}</div>}

      {analyzed && (
        <>
          <section className="stats">
            <div className="stat"><span>フォロワー</span><strong>{data.followers.length}</strong></div>
            <div className="stat"><span>フォロー中</span><strong>{data.following.length}</strong></div>
            <div className="stat"><span>相互</span><strong>{data.mutual.length}</strong></div>
            <div className="stat"><span>自分だけ</span><strong>{data.notFollowingBack.length}</strong></div>
            <div className="stat"><span>相手だけ</span><strong>{data.fans.length}</strong></div>
          </section>

          <section className="tabs">
            {TAB_CONFIG.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  className={activeTab === tab.key ? "tab active" : "tab"}
                  onClick={() => {
                    setActiveTab(tab.key);
                    setQuery("");
                  }}
                >
                  <Icon size={16} />
                  {tab.label}
                  <span>{data[tab.key]?.length || 0}</span>
                </button>
              );
            })}
          </section>

          <section className="listPanel">
            <div className="listHeader">
              <div>
                <h2>{activeConfig?.label}</h2>
                <p>{activeConfig?.description}</p>
              </div>
              <div className="listActions">
                <button className="secondary" onClick={saveCurrentCsv}><Download size={16} /> 今の一覧CSV</button>
                <button className="secondary" onClick={saveAllCsv}><Download size={16} /> 全CSV</button>
              </div>
            </div>

            <div className="searchBox">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ユーザー名で検索"
              />
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>ユーザー名</th>
                    <th>プロフィール</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((name, index) => (
                    <tr key={name}>
                      <td>{index + 1}</td>
                      <td className="username">@{name}</td>
                      <td>
                        <a href={`https://www.instagram.com/${name}/`} target="_blank" rel="noreferrer">
                          開く <ExternalLink size={14} />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!filteredList.length && (
                    <tr>
                      <td colSpan="3" className="empty">該当するユーザーはいません。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
