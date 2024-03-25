import { Resvg, initWasm } from "@resvg/resvg-wasm";
import React from "react";
import satori from "satori";
import resvgWasm from "./vendor/resvg.wasm";
import { Parser, jaModel } from "budoux";

// initialize budoux parser
const parser = new Parser(jaModel);

// initialize resvg
await initWasm(resvgWasm);

//biome-ignore lint/complexity/noBannedTypes: no banned types
export type Env = {};

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (request.method !== "GET") {
			return new Response("Method Not Allowed", { status: 405 });
		}
		const url = new URL(request.url);
		if (url.pathname !== "/") {
			return new Response("Not Found", { status: 404 });
		}

		const qURL = url.searchParams.get("url");
		if (qURL === null) {
			return new Response("Missing URL parameter", { status: 400 });
		}
		console.log(qURL);
		const response = await fetch(qURL);
		if (!response.ok) {
			return new Response("Failed to fetch URL", { status: 500 });
		}
		const ogpExtractor = new OGPExtractor();
		await new HTMLRewriter()
			.on('meta[property^="og:"]', ogpExtractor)
			.transform(response)
			.text(); // required to trigger the transformation

		if (ogpExtractor.image === "") {
			return new Response("No image found", { status: 404 });
		}

		const fontData = await getGoogleFont();
		const svg = await satori(
			<Component
				iconUrl={ogpExtractor.image}
				title={ogpExtractor.title}
				description={ogpExtractor.description}
			/>,
			{
				width: 1200,
				height: 630,
				fonts: [
					{
						name: "Roboto",
						data: fontData,
						weight: 400,
						style: "normal",
					},
				],
			},
		);

		const resvg = new Resvg(svg, {
			fitTo: {
				mode: "original",
			},
		});

		const pngData = resvg.render();
		const pngBuffer = pngData.asPng();
		return new Response(pngBuffer, {
			headers: {
				"Content-Type": "image/png",
			},
		});
	},
};

class OGPExtractor {
	title: string;
	description: string;
	image: string;

	constructor() {
		this.title = "";
		this.description = "";
		this.image = "";
	}

	element(element: Element) {
		const property = element.getAttribute("property");
		const content = element.getAttribute("content") || "";
		if (property === "og:title") {
			this.title = content;
		} else if (property === "og:description") {
			this.description = content;
		} else if (property === "og:image") {
			this.image = content;
		} else {
			console.log("ignore property: ", property, content);
		}
	}
}

async function getGoogleFont() {
	const familyResp = await fetch(
		"https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700",
	);
	if (!familyResp.ok) {
		throw new Error("Failed to load font data");
	}
	const css = await familyResp.text();
	const resource = css.match(
		/src: url\((.+)\) format\('(opentype|truetype)'\)/,
	);
	if (!resource) {
		throw new Error("Failed to parse font data");
	}

	const fontDataResp = await fetch(resource[1]);
	return await fontDataResp.arrayBuffer();
}

interface ComponentProps {
	iconUrl?: string;
	title: string;
	description: string;
}

const Component: React.FC<ComponentProps> = ({ iconUrl, title, description }) => {
	const words = parser.parse(description);
	const spans = words.map((word, i) => {
		console.log(word);
		// biome-ignore lint/suspicious/noArrayIndexKey: show elements in a table
		return <span key={i}>{word}</span>;
	});

	return (
		<div
			style={{
				display: "flex",
				flexDirection: "row",
				alignItems: "center",
				padding: "60px 30px",
				width: "1200px",
				height: "630px",
				// background: "#ADD8E6",
			}}
		>
			<img
				src={iconUrl}
				alt="Icon"
				style={{
					width: "500px",
					height: "500px",
					marginRight: "30px",
				}}
			/>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-start",
					justifyContent: 'center',
					// background: "gray",
					width: "600",
					height: "500",
				}}
			>
				<div style={{ fontSize: "30px" }}>{title}</div>
				<div style={{
					display: "flex",
					flexDirection: "row",
					flexWrap: "wrap",
					fontSize: "15px"
				}}>{spans}</div>
			</div>
		</div>
	);
};
