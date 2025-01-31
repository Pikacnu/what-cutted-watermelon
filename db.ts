import Database from 'bun:sqlite';

export const db = new Database('cutted.sqlite');

export enum ResponseStyle {
	Chaos,
	Normal,
	Scientific,
}

export type History = {
	id?: number;
	target: string;
	tool: string;
	cutted: boolean;
	icon: string;
	reason: string;
	chat_style: ResponseStyle | string;
	count: number;
	created_at: string;
};

db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target TEXT NOT NULL,
    tool TEXT NOT NULL,
    cutted BOOLEAN NOT NULL,
    icon TEXT NOT NULL,
    reason TEXT NOT NULL,
    chat_style INTEGER DEFAULT 1,
    count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

export async function insertHistory(
	target: string,
	tool: string,
	style: ResponseStyle,
	cutted: boolean,
	icon: string,
	reason: string,
) {
	db.query(
		'INSERT INTO history (target, tool, cutted, icon, chat_style, reason) VALUES (?, ?, ?, ?, ?, ?)',
	).run(target, tool, cutted, icon, style, reason);
}

export async function getHistory(
	target: string,
	tool: string,
	style: ResponseStyle = ResponseStyle.Normal,
): Promise<History | undefined> {
	const history = db
		.query(
			'SELECT * FROM history WHERE target = ? AND tool = ? AND chat_style = ?',
		)
		.get(target, tool, style);
	db.query(
		'UPDATE history SET count = count + 1 WHERE target = ? AND tool = ? AND chat_style = ?',
	).run(target, tool, style);
	return history as History | undefined;
}
