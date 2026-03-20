import { DB_Models } from "@ravenlens/backend"

export const load = async () => {
    const helpMaterialCategories = (await DB_Models.Help.helpMaterialModel.aggregate([
        {
            $match: {}
        },
        {
            $project: {
                categories: 1
            }
        }
    ])) as {
        categories: string[]
    }[];
    const uniqueCategories = new Set(
        helpMaterialCategories.reduce((previousCategory, behindCategory) => {
            behindCategory.categories = [
                ...previousCategory.categories,
                ...behindCategory.categories
            ];

            return behindCategory;
        }, { categories: [] }).categories
    );
    
    return {
        editModeCategoriesAvailable: Array.from(uniqueCategories)
    }
}
