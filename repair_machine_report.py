<?xml version="1.0" encoding="utf-8"?>
<odoo noupdate="1">
    <!--
        Restringe menus globais — visíveis só para Administradores.
        forcecreate="0" garante que erros de ref inexistente são ignorados.
    -->

    <!-- Discuss / Mensagens -->
    <record id="mail.menu_root_discuss" model="ir.ui.menu" forcecreate="0">
        <field name="groups_id" eval="[(4, ref('base.group_system'))]"/>
    </record>

</odoo>
