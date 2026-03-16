exports.seed = async function seed(knex) {
  const permissionRows = [
    { key: "*", description: "Super user" },
    { key: "forms.people.read", description: "Read people form" },
    { key: "forms.people.write", description: "Write people form" },
    { key: "forms.people.delete", description: "Delete people form" },
    { key: "forms.people.document.read", description: "Read people document field" },
    { key: "forms.people.audience_type.read", description: "Read people audience type field" },
    { key: "users.read", description: "Read users" },
    { key: "users.write", description: "Write users" },
    { key: "users.delete", description: "Delete users" },
    { key: "roles.read", description: "Read roles" },
    { key: "roles.write", description: "Write roles" },
    { key: "roles.delete", description: "Delete roles" },
  ];

  for (const row of permissionRows) {
    const exists = await knex("permissions").where({ key: row.key }).first();
    if (!exists) await knex("permissions").insert(row);
  }

  const admin = await knex("users").where({ email: process.env.SEED_ADMIN_EMAIL || "admin@example.com" }).first();
  if (admin) {
    const granted = await knex("user_permissions")
      .where({ user_id: admin.id, permission_key: "*" })
      .first();
    if (!granted) {
      await knex("user_permissions").insert({ user_id: admin.id, permission_key: "*" });
    }
  }

  const peopleForm = {
    key: "people.edit",
    name: "People Edit",
    entity_key: "people",
    permission_read: "forms.people.read",
    permission_write: "forms.people.write",
    permission_delete: "forms.people.delete",
    schema: {
      title: "Pessoa",
      fields: [
        { key: "id", label: "ID", type: "number", required: false, readonly: true },
        {
          key: "document",
          label: "CPF/CNPJ",
          type: "text",
          required: true,
          permission_key: "forms.people.document.read",
        },
        { key: "gender", label: "Genero", type: "select", required: false, options: [
          { label: "Masculino", value: "masculino" },
          { label: "Feminino", value: "feminino" },
          { label: "Outro", value: "outro" }
        ] },
        { key: "person_type", label: "Tipo de Pessoa", type: "select", required: true, options: [
          { label: "Fisica", value: "fisica" },
          { label: "Juridica", value: "juridica" }
        ] },
        {
          key: "audience_type_id",
          label: "Tipo de Publico",
          type: "select",
          required: false,
          permission_key: "forms.people.audience_type.read",
        },
      ],
      sections: [
        { key: "main", title: "Dados Gerais", fields: ["id", "document", "gender", "person_type"] },
        {
          key: "classification",
          title: "Classificacao",
          permission_key: "forms.people.audience_type.read",
          fields: ["audience_type_id"],
        },
      ],
      hooks: {
        beforeRender: [],
        afterRender: [],
        beforeSave: ["core.normalizeEmail"],
        afterSave: [],
        beforeDelete: [],
        afterDelete: [],
      },
    },
  };

  const existingForm = await knex("forms").where({ key: peopleForm.key }).first();
  if (!existingForm) {
    await knex("forms").insert(peopleForm);
  } else {
    await knex("forms")
      .where({ key: peopleForm.key })
      .update({
        name: peopleForm.name,
        entity_key: peopleForm.entity_key,
        permission_read: peopleForm.permission_read,
        permission_write: peopleForm.permission_write,
        permission_delete: peopleForm.permission_delete,
        schema: peopleForm.schema,
      });
  }
};
