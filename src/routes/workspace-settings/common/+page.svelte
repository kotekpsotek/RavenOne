<script lang="ts">
    import { defaultAvaiableOptions } from "..";

    defaultAvaiableOptions.update(avaiableOptions => {
        return avaiableOptions.map(option => {
            if (option.name === "Workspace Settings") {
                return {
                    ...option,
                    isSelected: true
                }
            }

            return option;
        });
    })
</script>