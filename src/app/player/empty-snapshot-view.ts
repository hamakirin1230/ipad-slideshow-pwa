export type PlayerEmptySnapshotGuidanceItem = {
  title: string;
  description: string;
};

export type PlayerEmptySnapshotView = {
  title: string;
  description: string;
  primaryHref: string;
  primaryHash?: string;
  primaryLabel: string;
  guidanceItems: PlayerEmptySnapshotGuidanceItem[];
};

export function getPlayerEmptySnapshotView(input: {
  googleStatus: string;
  isOnline: boolean | null;
}): PlayerEmptySnapshotView {
  const isDisconnected = input.googleStatus !== "connected";

  if (input.isOnline === false) {
    return {
      title: "オフライン再生に必要なデータがローカルにありません",
      description:
        "現在オフラインのため、Google Driveからアルバムや写真を取得できません。オンラインに戻してから「ローカルに保存」を実行してください。",
      primaryHref: "/admin",
      primaryLabel: "つくるへ",
      guidanceItems: [
        {
          title: "オンラインに戻します",
          description:
            "ローカルに再生用コピーがない状態では、オフラインのまま素材を取得できません。",
        },
        isDisconnected
          ? {
              title: "オンライン復帰後、Googleアカウントでつなぎます",
              description:
                "設定で「Googleアカウントでつなぐ」を押してから、「つくる」で「ローカルに保存」を実行してください。",
            }
          : {
              title: "「つくる」でローカルへの保存を実行します",
              description:
                "オンライン復帰後、アルバムの状態を確認してから「ローカルに保存」を実行してください。",
            },
      ],
    };
  }

  if (isDisconnected) {
    return {
      title: "まだGoogleとつながっていません",
      description:
        "写真の保存にGoogleアカウント（Drive）を使います。このアプリの新規登録はありません。設定で「Googleアカウントでつなぐ」を押してください。",
      primaryHref: "/settings",
      primaryLabel: "Googleアカウントでつなぐ",
      guidanceItems: [
        {
          title: "Googleアカウントでつなぎます",
          description:
            "ログインに相当する操作はこの接続だけです。アカウント選択画面は、ボタンを押したときだけ開きます。",
        },
        {
          title: "つないだあと、アルバムをローカルに保存します",
          description:
            "「つくる」でアルバムを用意し、「ローカルに保存」すると再生できます。",
        },
      ],
    };
  }

  return {
    title: "ローカルにはまだ再生用コピーがありません",
    description:
      "「つくる」の「ローカル」から保存すると、再生できるようになります。",
    primaryHref: "/admin",
    primaryHash: "device",
    primaryLabel: "ローカルに保存する",
    guidanceItems: [
      {
        title: "「つくる」でローカルへの保存を実行します",
        description:
          "Google Drive上のアルバムを、この端末の再生用コピーとして保存します。",
      },
    ],
  };
}
