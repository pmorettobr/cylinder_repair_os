<?xml version="1.0" encoding="utf-8"?>
<odoo>

    <!-- ── Componentes ──────────────────────────────────────────────────── -->

    <record id="view_repair_component_type_tree" model="ir.ui.view">
        <field name="name">repair.component.type.tree</field>
        <field name="model">repair.component.type</field>
        <field name="arch" type="xml">
            <tree string="Componentes">
                <field name="sequence" widget="handle"/>
                <field name="code" string="Código"/>
                <field name="name" string="Componente"/>
                <field name="notes" string="Observação"/>
                <field name="active" optional="hide"/>
            </tree>
        </field>
    </record>

    <record id="view_repair_component_type_form" model="ir.ui.view">
        <field name="name">repair.component.type.form</field>
        <field name="model">repair.component.type</field>
        <field name="arch" type="xml">
            <form string="Componente">
                <sheet>
                    <div class="oe_title">
                        <label for="name"/>
                        <h1><field name="name" placeholder="Nome do componente..."/></h1>
                    </div>
                    <group>
                        <field name="code" string="Código"/>
                        <field name="sequence" string="Sequência"/>
                        <field name="active"/>
                        <field name="notes" string="Observação"/>
                    </group>
                </sheet>
            </form>
        </field>
    </record>

    <record id="action_repair_component_types" model="ir.actions.act_window">
        <field name="name">Componentes</field>
        <field name="res_model">repair.component.type</field>
        <field name="view_mode">tree,form</field>
    </record>

    <!-- ── Sub-componentes ─────────────────────────────────────────────── -->

    <record id="view_repair_sub_component_tree" model="ir.ui.view">
        <field name="name">repair.sub.component.tree</field>
        <field name="model">repair.sub.component</field>
        <field name="arch" type="xml">
            <tree string="Sub-componentes">
                <field name="sequence" widget="handle"/>
                <field name="component_type_id" string="Componente Pai"/>
                <field name="name" string="Sub-componente"/>
                <field name="notes" string="Observação"/>
            </tree>
        </field>
    </record>

    <record id="action_repair_sub_components" model="ir.actions.act_window">
        <field name="name">Sub-componentes</field>
        <field name="res_model">repair.sub.component</field>
        <field name="view_mode">tree,form</field>
    </record>

</odoo>
