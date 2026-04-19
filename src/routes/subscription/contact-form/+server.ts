import { randomUUID } from "node:crypto";
import { getAuthenticatedPayload } from "$lib/server/auth/request";
import { DB_Models } from "@ravenlens/backend";
import type {
	SubscriptionContactForm,
	SubscriptionContactFormFieldErrors
} from "@ravenlens/shared";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const MIN_COMPANY_SIZE = 1;
const MAX_COMPANY_SIZE = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactFormResponse = {
	status: boolean;
	message?: string;
	error?: string;
	fieldErrors?: SubscriptionContactFormFieldErrors;
};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}

function asTrimmedString(formDataValue: FormDataEntryValue | null): string {
	if (typeof formDataValue !== "string") {
		return "";
	}

	return formDataValue.trim();
}

function parseCompanySize(rawCompanySize: string): number | null {
	const parsed = Number.parseInt(rawCompanySize, 10);
	if (!Number.isFinite(parsed)) {
		return null;
	}

	return parsed;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const formData = await request.formData();

		const fullName = asTrimmedString(formData.get("fullName"));
		const email = asTrimmedString(formData.get("email")).toLowerCase();
		const companyName = asTrimmedString(formData.get("companyName"));
		const companySizeRaw = asTrimmedString(formData.get("companySize"));
		const companySize = parseCompanySize(companySizeRaw);

		const fieldErrors: SubscriptionContactFormFieldErrors = {};

		if (!fullName) {
			fieldErrors.fullName = "Full name is required";
		}

		if (!email) {
			fieldErrors.email = "Email is required";
		} else if (!EMAIL_PATTERN.test(email)) {
			fieldErrors.email = "Provide a valid email address";
		}

		if (!companyName) {
			fieldErrors.companyName = "Company name is required";
		}

		if (companySize === null) {
			fieldErrors.companySize = "Company size is required";
		} else if (companySize < MIN_COMPANY_SIZE || companySize > MAX_COMPANY_SIZE) {
			fieldErrors.companySize = `Company size has to be between ${MIN_COMPANY_SIZE} and ${MAX_COMPANY_SIZE}`;
		}

		if (Object.keys(fieldErrors).length > 0) {
			return json(
				{
					status: false,
					error: "Please complete all required fields",
					fieldErrors
				} satisfies ContactFormResponse,
				{ status: 400 }
			);
		}

		if (companySize === null) {
			return json(
				{
					status: false,
					error: "Company size is required",
					fieldErrors: {
						companySize: "Company size is required"
					}
				} satisfies ContactFormResponse,
				{ status: 400 }
			);
		}

		const payload = getAuthenticatedPayload(request, cookies);
		const now = new Date();

		await DB_Models.SubscriptionContactForm.subscriptionContactFormModel.create({
			id: randomUUID(),
			fullName,
			email,
			companyName,
			companySize,
			createdAt: now,
			updatedAt: now,
			...(payload?.userId ? { submittedByUserId: payload.userId } : {})
		} satisfies SubscriptionContactForm);

		return json(
			{
				status: true,
				message: "Thanks! Your enterprise contact request was sent successfully."
			} satisfies ContactFormResponse,
			{ status: 201 }
		);
	} catch (error) {
		return json(
			{
				status: false,
				error: toErrorMessage(error)
			} satisfies ContactFormResponse,
			{ status: 500 }
		);
	}
};
