package sh.reece.core;

import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import org.bukkit.inventory.MenuType;
import sh.reece.tools.BaseCommand;
import sh.reece.tools.Main;

public class Workbench extends BaseCommand {

    public static final String PLAYER_ONLY = "<red>[!] Only players can open a workbench!";

    public Workbench(Main instance) {
        super(instance, "Core.Workbench", "workbench", "craft");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command cmd, String label, String[] args) {
        if (noPermission(sender, cmd)) return true;

        if (sender instanceof Player player) {
            MenuType.CRAFTING.create(player); // unstable in 1.21.5 but stable and unchanged in <=1.21.11
        } else {
            sender.sendRichMessage(PLAYER_ONLY);
        }
        return true;
    }
}
