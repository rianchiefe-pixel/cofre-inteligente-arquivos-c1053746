import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { analyzeCategoriesWithAI } from "./category-analyzer.server";

export const getCategoryDeduplicationSuggestions = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({
    profileId: z.string(),
    token: z.string().optional()
  }).parse(data))
  .handler(async ({ data: input }) => {
    return analyzeCategoriesWithAI(input.profileId, input.token);
  });
