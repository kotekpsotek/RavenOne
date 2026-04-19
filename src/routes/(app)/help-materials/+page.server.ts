import { DB_Models } from "@ravenlens/backend"

export const load = async () => {
    const helpMaterials = await DB_Models.Help.helpMaterialModel.find({});

    console.log("h", helpMaterials)
    return {
        helpMaterials: helpMaterials
    }
}