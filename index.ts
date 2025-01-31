import OpenAI from 'openai';
import z from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { getHistory, insertHistory } from './db';
import { type History, ResponseStyle } from './db';

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

const responseFormat = z.object({
	icon: z.string(),
	cutted: z.boolean(),
	reason: z.string(),
});

const responseStyle: Record<ResponseStyle, string> = {
	[ResponseStyle.Chaos]:
		'You thrive in chaos. Rules do not bind you, and you can give wild, unexpected answers. Logic is optional—feel free to claim that a watermelon cannot be cut with a watermelon knife, or that paper can slice through steel under the right conditions.',
	[ResponseStyle.Normal]:
		'You respond like an ordinary person, providing reasonable and conventional answers based on common knowledge and logical reasoning.',
	[ResponseStyle.Scientific]:
		'You are a highly skilled materials scientist and mechanical engineer, specializing in material interactions and failure mechanics. Today, you face a critical challenge: determining whether A can cut through B under specific conditions. Your expertise could drive advancements in industrial manufacturing, enhance engineering safety, or resolve a high-stakes experimental dilemma. Conduct a rigorous, step-by-step analysis, considering material properties, mechanical stress, thermal effects, and environmental factors.',
};

const responseToText: Record<ResponseStyle, string> = {
	[ResponseStyle.Chaos]: 'Chaos',
	[ResponseStyle.Normal]: 'Normal',
	[ResponseStyle.Scientific]: 'Scientific',
};

async function getResponse(
	target: string,
	tool: string,
	style: ResponseStyle = ResponseStyle.Normal,
): Promise<History | null> {
	target = target.toLowerCase().trim();
	tool = tool.toLowerCase().trim();
	const history = await getHistory(target, tool, style);
	if (history) {
		console.log('hit cache');
		return history;
	}
	const response = await openai.beta.chat.completions.parse({
		model: 'gpt-4o-mini-2024-07-18',
		messages: [
			{
				role: 'system',
				content: responseStyle[style],
			},
			{
				role: 'user',
				content: `Is ${target} cutted by a ${tool}?`,
			},
		],
		response_format: zodResponseFormat(responseFormat, 'cutted'),
	});

	const research_paper = response.choices[0].message.parsed;

	if (response.choices[0].finish_reason === 'length') {
		// Handle the case where the model did not return a complete response
		throw new Error('Incomplete response');
	}
	if (!research_paper) {
		throw new Error('No response');
	}
	insertHistory(
		target,
		tool,
		style,
		research_paper.cutted,
		research_paper.icon,
		research_paper.reason,
	);
	return Object.assign(research_paper, {
		target,
		tool,
		chat_style: responseToText[style],
		count: 1,
		created_at: new Date().toISOString(),
	});
}

let port = 8080;

function createResponseMessage(message: string, info: string): string {
	return JSON.stringify({
		message: message,
		info: info,
	});
}

Bun.serve({
	port: port,
	async fetch(request, server) {
		const url = new URL(request.url);
		console.log(`${request.method} ${url.pathname}`);
		if (url.pathname === '/') {
			return new Response(Bun.file('./src/index.html'), {
				headers: {
					'Content-Type': 'text/html',
				},
			});
		}
		if (url.pathname === '/api/cut') {
			if (request.method !== 'POST') {
				return new Response('Method Not Allowed', {
					status: 405,
				});
			}
			let body;
			try {
				body = await request.json();
			} catch (e) {
				return new Response(createResponseMessage('Bad Request', 'need body'), {
					status: 400,
				});
			}
			const { target, tool, style } = body;

			if (!(target && tool)) {
				return new Response(
					createResponseMessage('Bad Request', 'need target and tool'),
					{
						status: 400,
					},
				);
			}
			const responseStyle = ResponseStyle[style as keyof typeof ResponseStyle];
			if (responseStyle === undefined) {
				return new Response(
					createResponseMessage('Bad Request', 'invalid style'),
					{
						status: 400,
					},
				);
			}

			const response = await getResponse(target, tool, responseStyle);
			if (!response) {
				return new Response(
					createResponseMessage('Internal Server Error', ''),
					{
						status: 500,
					},
				);
			}

			await new Promise((resolve) => setTimeout(resolve, 1000));

			return new Response(
				JSON.stringify(
					Object.assign(
						{
							message: 'OK',
						},
						response,
					),
				),
				{
					headers: {
						'Content-Type': 'application/json',
					},
				},
			);
		}
		return new Response(createResponseMessage('Not Found', ''), {
			status: 404,
		});
	},
});

console.log(`Server running at http://localhost:${port}`);
