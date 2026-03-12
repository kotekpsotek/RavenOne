# Workspace Models
This file refers to the list with models avaiable for specified workspace
> To get all models use "/all" route

This assumes:
1. Subscription of owner of workspace or its lack:
    * Subscriber with enterprise permission can carry access to more powerfull models and others follow this guideline with schema: Starter > Growth > Enterprise (where enterprise has the most of privilages in using models)
    * Owner hasn't got subscription isn't able to use any model
2. The list of avaiable models is downloaded too base on what api key was specified to provider. E.g:
    - When user didn't specify the OpenAI API Key the OpenAI API Models aren't able to be use