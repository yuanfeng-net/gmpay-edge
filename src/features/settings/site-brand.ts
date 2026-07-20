export type SiteBrand = {
	name: string;
	logoUrl: string;
	title: string;
	supportUrl: string;
	backgroundColor: string;
	backgroundImageUrl: string;
};

export const defaultSiteBrand: SiteBrand = {
	name: "GMPay Edge",
	logoUrl: "/favicon.png",
	title: "GMPay Edge",
	supportUrl: "",
	backgroundColor: "",
	backgroundImageUrl: "",
};
