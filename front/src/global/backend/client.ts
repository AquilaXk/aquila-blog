import type { paths } from "@/global/backend/apiV1/schema";
import createClient from "openapi-fetch";

const NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const client = createClient<paths>({
  baseUrl: NEXT_PUBLIC_API_BASE_URL,
  credentials: "include",
});

export default client;
